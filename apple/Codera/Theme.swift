import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/**
 * Codera's look, the same one the website and the Android app wear: Scoutie
 * Sans, the green-to-blue mark, pill buttons and the one gradient button that
 * carries the main action on a screen.
 */
enum Brand {
  static let green = Color(red: 0.13, green: 0.77, blue: 0.37)   // #22c55e
  static let blue = Color(red: 0.23, green: 0.51, blue: 0.96)    // #3b82f6
  static let sky = Color(red: 0.38, green: 0.65, blue: 0.98)     // #60a5fa
  static let red = Color(red: 0.94, green: 0.27, blue: 0.27)     // #ef4444

  /// Only the mark and the main button wear the gradient; everything else is flat.
  static let mark = LinearGradient(colors: [green, sky], startPoint: .topLeading, endPoint: .bottomTrailing)
}

enum Sans {
  static func regular(_ size: CGFloat) -> Font { .custom("ScoutieSans-Regular", size: size) }
  static func medium(_ size: CGFloat) -> Font { .custom("ScoutieSans-Medium", size: size) }
  static func semibold(_ size: CGFloat) -> Font { .custom("ScoutieSans-SemiBold", size: size) }
  static func bold(_ size: CGFloat) -> Font { .custom("ScoutieSans-Bold", size: size) }
  static func heavy(_ size: CGFloat) -> Font { .custom("ScoutieSans-ExtraBold", size: size) }

  /// The tab bar and the other bars UIKit draws for us wear it too.
  static func useEverywhere() {
#if !os(visionOS)
    guard let label = UIFont(name: "ScoutieSans-SemiBold", size: 10),
          let title = UIFont(name: "ScoutieSans-ExtraBold", size: 17),
          let big = UIFont(name: "ScoutieSans-ExtraBold", size: 32) else { return }
    let item = UITabBarItemAppearance()
    for style in [item.normal, item.selected, item.disabled] {
      style.titleTextAttributes = [.font: label]
    }
    let bar = UITabBarAppearance()
    bar.configureWithDefaultBackground()
    bar.stackedLayoutAppearance = item
    bar.inlineLayoutAppearance = item
    bar.compactInlineLayoutAppearance = item
    UITabBar.appearance().standardAppearance = bar
    UITabBar.appearance().scrollEdgeAppearance = bar

    UINavigationBar.appearance().titleTextAttributes = [.font: title]
    UINavigationBar.appearance().largeTitleTextAttributes = [.font: big]
#endif
  }
}

/** The green-to-blue button: one to a screen, for the thing the screen is for. */
struct BrandButton: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(Sans.heavy(16))
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity)
      .frame(height: 50)
      .background(Brand.mark, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .opacity(configuration.isPressed ? 0.85 : 1)
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}

/** The quiet one: a bordered pill, for everything beside the main action. */
struct PillButton: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(Sans.bold(14))
      .padding(.horizontal, 16)
      .frame(height: 38)
      .background(.background.secondary, in: Capsule())
      .overlay(Capsule().stroke(.separator, lineWidth: 0.5))
      .opacity(configuration.isPressed ? 0.7 : 1)
  }
}

/** The app's mark: the code brackets on the gradient. */
struct Mark: View {
  var size: CGFloat = 86

  var body: some View {
    RoundedRectangle(cornerRadius: size * 0.26, style: .continuous)
      .fill(Brand.mark)
      .frame(width: size, height: size)
      .overlay(
        Image(systemName: "chevron.left.forwardslash.chevron.right")
          .font(.system(size: size * 0.4, weight: .bold))
          .foregroundStyle(.white)
      )
  }
}
