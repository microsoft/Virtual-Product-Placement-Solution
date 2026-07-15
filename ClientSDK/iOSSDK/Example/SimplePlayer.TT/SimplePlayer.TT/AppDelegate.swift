//
//  AppDelegate.swift
//  SimplePlayer.TT
//

import UIKit
import IOSSDKSampleBuffer

/// Decoded from `TTSDKConfig.json` in the app bundle. Keeping appId / license /
/// package name out of the source makes it easy to swap credentials during
/// debugging without recompiling logic.
private struct TTSDKConfig: Decodable {
    let appId: String
    let licenseName: String
    let packageName: String
}

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        initTTSDK()
        return true
    }

    private func initTTSDK() {
        #if DEBUG
        TTVideoEngine.setLogFlag(.all)
        #endif

        // Previous hard-coded form (kept for reference — values now come from TTSDKConfig.json):
        // let appId = "1018094"
        // let licenseName = "SimplePlayer-TT-License.lic"
        // let configuration = TTSDKConfiguration.defaultConfiguration(withAppID: appId, licenseName: licenseName)
        
        guard let config = Self.loadConfig() else {
            assertionFailure("TTSDKConfig.json missing or invalid — TTSDK will not start.")
            return
        }

        // Sanity check: warn when the JSON's packageName drifts from the actual
        // bundle id (the license is bound to the bundle id, so a mismatch will
        // make license validation fail with 401).
        if let bundleId = Bundle.main.bundleIdentifier, bundleId != config.packageName {
            dlog("⚠️ [TTSDKConfig] packageName=\(config.packageName) does not match bundle id=\(bundleId)")
        }

        let configuration = TTSDKConfiguration.defaultConfiguration(
            withAppID: config.appId,
            licenseName: config.licenseName
        )

        // Cache settings
        let vodConfig = TTSDKVodConfiguration()
        vodConfig.cacheMaxSize = 300 * 1024 * 1024 // 300MB
        configuration.vodConfiguration = vodConfig

        TTSDKManager.start(with: configuration)
    }

    private static func loadConfig() -> TTSDKConfig? {
        guard let url = Bundle.main.url(forResource: "TTSDKConfig", withExtension: "json") else {
            dlog("❌ [TTSDKConfig] TTSDKConfig.json not found in bundle")
            return nil
        }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(TTSDKConfig.self, from: data)
        } catch {
            dlog("❌ [TTSDKConfig] Failed to decode TTSDKConfig.json: \(error)")
            return nil
        }
    }
}
