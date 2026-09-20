package com.maudconnect.bluetooth

import android.Manifest
import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Detects the phone's Classic-Bluetooth hands-free/audio connection to the
 * car (BluetoothHeadset/A2dp profiles) — a different API surface than the
 * BLE scanning react-native-background-geolocation uses elsewhere in this
 * app. Used to auto-select the paired vehicle for a trip; does not itself
 * identify the driver (see useBluetoothVehicleDetection.ts).
 */
class BluetoothVehicleDetectionModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var connectedDeviceName: String? = null
  private var receiverRegistered = false

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val device = intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE) ?: return
      val state = intent.getIntExtra(BluetoothProfile.EXTRA_STATE, -1)

      when (state) {
        BluetoothProfile.STATE_CONNECTED -> {
          val name = deviceNameOrNull(device) ?: return
          connectedDeviceName = name
          emitEvent("onBluetoothDeviceConnected", name)
        }
        BluetoothProfile.STATE_DISCONNECTED -> {
          val name = deviceNameOrNull(device)
          if (connectedDeviceName != null && connectedDeviceName == name) {
            connectedDeviceName = null
          }
          emitEvent("onBluetoothDeviceDisconnected", name)
        }
      }
    }
  }

  // Screen interactive state (on + unlocked vs. off/locked). Phone-usage
  // detection on the JS side used to key purely off React Native's AppState,
  // but on Android locking the screen also reports the app as 'background' —
  // so an entire drive with the phone in a holder, screen off, was counted
  // as "phone usage". Handling the phone means the screen is interactive;
  // this is what tells those two apart.
  private var screenReceiverRegistered = false
  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_SCREEN_OFF -> emitScreenState(false)
        // SCREEN_ON fires while still on the lock screen; USER_PRESENT is
        // the actual unlock. Both are reported — JS treats "on" as
        // interactive only once USER_PRESENT confirms it, unless the device
        // has no lock (then USER_PRESENT never comes and SCREEN_ON suffices,
        // which isScreenInteractive() below resolves via the keyguard).
        Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> emitScreenState(isScreenInteractiveNow())
      }
    }
  }

  private fun isScreenInteractiveNow(): Boolean {
    val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
    val km = reactApplicationContext.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
    return pm.isInteractive && !km.isKeyguardLocked
  }

  private fun emitScreenState(interactive: Boolean) {
    val params = Arguments.createMap().apply { putBoolean("interactive", interactive) }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("onScreenInteractiveChanged", params)
  }

  @ReactMethod
  fun startScreenStateUpdates() {
    if (screenReceiverRegistered) return
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    reactApplicationContext.registerReceiver(screenReceiver, filter)
    screenReceiverRegistered = true
  }

  @ReactMethod
  fun isScreenInteractive(promise: Promise) {
    promise.resolve(isScreenInteractiveNow())
  }

  override fun getName(): String = "BluetoothVehicleDetection"

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by RN's NativeEventEmitter contract — actual (de)registration
    // of the OS-level BroadcastReceiver is handled in start()/stop() below,
    // called explicitly from JS rather than tied to listener add/remove
    // counts, since this needs to run for the app's whole lifetime.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // See addListener().
  }

  @ReactMethod
  fun start(promise: Promise) {
    if (receiverRegistered) {
      promise.resolve(hasPermission())
      return
    }

    if (!hasPermission()) {
      promise.resolve(false)
      return
    }

    val filter = IntentFilter().apply {
      addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED)
      addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED)
    }
    reactApplicationContext.registerReceiver(receiver, filter)
    receiverRegistered = true

    checkAlreadyConnectedDevice()
    promise.resolve(true)
  }

  @ReactMethod
  fun stop() {
    if (!receiverRegistered) return
    try {
      reactApplicationContext.unregisterReceiver(receiver)
    } catch (e: IllegalArgumentException) {
      // Already unregistered — safe to ignore.
    }
    receiverRegistered = false
  }

  @ReactMethod
  fun getConnectedDeviceName(promise: Promise) {
    promise.resolve(connectedDeviceName)
  }

  // Lists the phone's already-bonded (paired-at-the-OS-level) device names —
  // NOT a scan for nearby devices, and NOT a way to create a new bond.
  // Android reserves both of those to system apps; getBondedDevices() only
  // returns devices already in the OS's own pairing list. Lets
  // VehicleListScreen offer "which of these is my car?" in-app, without
  // being able to promise an in-app "Connect" that actually establishes a
  // new OS-level pairing — that part still has to go through Settings.
  @ReactMethod
  fun getBondedDevices(promise: Promise) {
    if (!hasPermission()) {
      promise.resolve(Arguments.createArray())
      return
    }
    val manager = reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter = manager?.adapter
    if (adapter == null) {
      promise.resolve(Arguments.createArray())
      return
    }
    val names = Arguments.createArray()
    try {
      adapter.bondedDevices?.forEach { device ->
        deviceNameOrNull(device)?.let { names.pushString(it) }
      }
    } catch (e: SecurityException) {
      // Permission revoked between the check above and this call — resolve
      // whatever was already collected rather than rejecting the promise.
    }
    promise.resolve(names)
  }

  private fun hasPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.BLUETOOTH_CONNECT,
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun deviceNameOrNull(device: BluetoothDevice): String? {
    if (!hasPermission()) return null
    return try {
      device.name
    } catch (e: SecurityException) {
      null
    }
  }

  // Covers the case where the car's Bluetooth was already connected before
  // start() was called (e.g. app cold-launched after already being in the
  // car) — checks the profiles' currently-connected devices directly rather
  // than waiting for a future state-change broadcast. getProfileProxy() is
  // async (resolves via ServiceListener callback), so this can't return a
  // value synchronously — it updates connectedDeviceName and emits the same
  // "onBluetoothDeviceConnected" event a live broadcast would, once resolved.
  //
  // Also the only place that can CLEAR a stale connectedDeviceName — the
  // receiver above only nulls it out on a live STATE_DISCONNECTED broadcast,
  // which requires the receiver to have been registered continuously through
  // the actual disconnect. start()/stop() get called every time
  // RootBannerStack (mounts useBluetoothVehicleDetection.ts) mounts/unmounts
  // — e.g. isAuthenticated briefly flickering, or the process surviving in
  // the background via BackgroundGeolocation's foreground service well past
  // when the user thinks the app is "closed" — so a real disconnect (or the
  // device being forgotten from OS Bluetooth settings entirely) landing
  // exactly while the receiver was unregistered was silently missed, leaving
  // this field stuck reporting an old, no-longer-real device name
  // indefinitely on every later getConnectedDeviceName() call and start()
  // (real-world symptom: the app declaring "car connected" on a fresh
  // launch with no OS-level Bluetooth pairing to the car at all). Both
  // HEADSET and A2DP must report back with nothing connected before
  // clearing — a car can be connected via only one of the two profiles, so
  // acting on either one's empty result alone would risk wrongly clearing a
  // connection the other profile still genuinely has.
  private fun checkAlreadyConnectedDevice() {
    if (!hasPermission()) return
    val manager = reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      ?: return
    val adapter = manager.adapter ?: return

    var headsetChecked = false
    var a2dpChecked = false
    var foundName: String? = null

    fun finalizeIfDone() {
      if (!headsetChecked || !a2dpChecked) return
      if (foundName != null) {
        if (connectedDeviceName != foundName) {
          connectedDeviceName = foundName
          emitEvent("onBluetoothDeviceConnected", foundName)
        }
      } else if (connectedDeviceName != null) {
        val stale = connectedDeviceName
        connectedDeviceName = null
        emitEvent("onBluetoothDeviceDisconnected", stale)
      }
    }

    val profileListener = object : BluetoothProfile.ServiceListener {
      override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
        val connected = proxy.connectedDevices.firstOrNull()
        val name = connected?.let { deviceNameOrNull(it) }
        if (name != null) foundName = name
        when (profile) {
          BluetoothProfile.HEADSET -> headsetChecked = true
          BluetoothProfile.A2DP -> a2dpChecked = true
        }
        adapter.closeProfileProxy(profile, proxy)
        finalizeIfDone()
      }
      override fun onServiceDisconnected(profile: Int) {}
    }
    adapter.getProfileProxy(reactApplicationContext, profileListener, BluetoothProfile.HEADSET)
    adapter.getProfileProxy(reactApplicationContext, profileListener, BluetoothProfile.A2DP)
  }

  private fun emitEvent(eventName: String, deviceName: String?) {
    val params = Arguments.createMap()
    params.putString("deviceName", deviceName)
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }
}
