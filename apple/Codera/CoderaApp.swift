import SwiftUI
import FirebaseCore

/**
 * Codera for iPhone, iPad and Vision Pro, written in SwiftUI.
 *
 * The Android app stays React Native; both read and write the same Firebase
 * project (codera-46b86), so a post made here is the same post everywhere.
 */
@main
struct CoderaApp: App {
  @StateObject private var store = Store()

  init() {
    FirebaseApp.configure()
    Sans.useEverywhere()
  }

  var body: some Scene {
    WindowGroup {
      RootView().environmentObject(store)
    }
  }
}

