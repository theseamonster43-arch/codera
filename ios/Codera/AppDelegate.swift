import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // The window itself belongs to the scene below, not to the app.
    return true
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
  }
}

/**
 * Codera's window.
 *
 * An app built with the iOS 26 SDK has to put its window on a scene: iOS
 * refuses to launch one that only has an app delegate, which is also what lets
 * the app open as a window on a Vision Pro and side by side on an iPad. React
 * Native is started here, once for the window the scene hands us.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let app = UIApplication.shared.delegate as? AppDelegate,
          let factory = app.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    factory.startReactNative(withModuleName: "Codera", in: window, launchOptions: nil)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  // Holds the launch screen up until JavaScript draws its first frame. Without
  // this, iOS drops the launch screen as soon as the window appears and an empty
  // root view flashes before the app has rendered anything. The first frame is
  // src/Splash.js, drawn to match the launch screen, so the hand-off is invisible.
  override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    rootView.backgroundColor = UIColor(named: "SplashBackground")
    if let launch = UIStoryboard(name: "LaunchScreen", bundle: nil).instantiateInitialViewController() {
      rootView.loadingView = launch.view
    }
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
