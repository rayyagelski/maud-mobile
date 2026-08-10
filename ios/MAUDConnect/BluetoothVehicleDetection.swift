import AVFAudio
import Foundation

/// Detects the phone's audio route switching to the car's Bluetooth
/// hands-free/audio connection (HFP/A2DP) — used to auto-select the paired
/// vehicle for a trip. Does not itself identify the driver (see
/// useBluetoothVehicleDetection.ts). No Bluetooth permission/usage
/// description is needed on iOS for this — it's audio-route info via
/// AVAudioSession, not CoreBluetooth.
@objc(BluetoothVehicleDetection)
class BluetoothVehicleDetection: RCTEventEmitter {
  private var observing = false
  private var connectedDeviceName: String?

  override func supportedEvents() -> [String]! {
    return ["onBluetoothDeviceConnected", "onBluetoothDeviceDisconnected"]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func startObserving() {
    observing = true
  }

  override func stopObserving() {
    observing = false
  }

  @objc(start:rejecter:)
  func start(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
    connectedDeviceName = bluetoothDeviceName(in: AVAudioSession.sharedInstance().currentRoute)
    resolve(true)
  }

  @objc func stop() {
    NotificationCenter.default.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
  }

  @objc(getConnectedDeviceName:rejecter:)
  func getConnectedDeviceName(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(connectedDeviceName)
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    let newName = bluetoothDeviceName(in: AVAudioSession.sharedInstance().currentRoute)

    if newName != nil && newName != connectedDeviceName {
      connectedDeviceName = newName
      if observing {
        sendEvent(withName: "onBluetoothDeviceConnected", body: ["deviceName": newName!])
      }
    } else if newName == nil && connectedDeviceName != nil {
      let previousName = connectedDeviceName
      connectedDeviceName = nil
      if observing {
        sendEvent(withName: "onBluetoothDeviceDisconnected", body: ["deviceName": previousName as Any])
      }
    }
  }

  private func bluetoothDeviceName(in route: AVAudioSessionRouteDescription) -> String? {
    let bluetoothPortTypes: Set<AVAudioSession.Port> = [.bluetoothHFP, .bluetoothA2DP, .bluetoothLE]
    return route.outputs.first { bluetoothPortTypes.contains($0.portType) }?.portName
  }
}
