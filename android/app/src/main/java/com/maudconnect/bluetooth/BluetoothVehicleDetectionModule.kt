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
  private fun checkAlreadyConnectedDevice() {
    if (!hasPermission()) return
    val manager = reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      ?: return
    val adapter = manager.adapter ?: return

    val profileListener = object : BluetoothProfile.ServiceListener {
      override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
        val connected = proxy.connectedDevices.firstOrNull()
        val name = connected?.let { deviceNameOrNull(it) }
        if (name != null && connectedDeviceName != name) {
          connectedDeviceName = name
          emitEvent("onBluetoothDeviceConnected", name)
        }
        adapter.closeProfileProxy(profile, proxy)
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
