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

  static let amber = Color(red: 0.96, green: 0.62, blue: 0.04)  // #f59e0b
  static let onGreen = Color(red: 0.02, green: 0.08, blue: 0.04)  // #04140a

  /// Only the mark and the main button wear the gradient; everything else is flat.
  static let mark = LinearGradient(colors: [green, sky], startPoint: .topLeading, endPoint: .bottomTrailing)

  // The surfaces, the same values as src/theme.js and web/styles.css. Without
  // these every view falls through to Apple's own greys and Apple's blue, which
  // is what made the app look like two products wearing one name.
  static let bg = shifting(dark: 0x080C0A, light: 0xF5F7F6)
  static let bg2 = shifting(dark: 0x0D1411, light: 0xFFFFFF)
  static let bg3 = shifting(dark: 0x111A15, light: 0xEBEFEC)
  static let text = shifting(dark: 0xE2E8E4, light: 0x0F1A14)
  /// Darker in the light theme: the same grey on white fails contrast.
  static let muted = shifting(dark: 0x6B7B6F, light: 0x56655B)
  /// Behind a video, black in either appearance.
  static let stage = Color.black

  /// A hairline of the brand green rather than a grey rule.
  static let line = shiftingAlpha(dark: (0x22C55E, 0.12), light: (0x166534, 0.14))

  private static func shifting(dark: Int, light: Int) -> Color {
#if canImport(UIKit)
    Color(UIColor { $0.userInterfaceStyle == .dark ? hex(dark) : hex(light) })
#else
    Color(hex: light)
#endif
  }

  private static func shiftingAlpha(dark: (Int, CGFloat), light: (Int, CGFloat)) -> Color {
#if canImport(UIKit)
    Color(UIColor {
      let pick = $0.userInterfaceStyle == .dark ? dark : light
      return hex(pick.0).withAlphaComponent(pick.1)
    })
#else
    Color(hex: light.0).opacity(light.1)
#endif
  }

#if canImport(UIKit)
  private static func hex(_ value: Int) -> UIColor {
    UIColor(
      red: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: 1
    )
  }
#endif
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

/**
 * A titled block of a screen, the way Codera draws one.
 *
 * SwiftUI's Form and Section are iOS Settings in a trench coat: inset grouped
 * rows, grey headers in small caps, chevrons and separators that belong to
 * Apple's design and not to ours. A Codera screen is cards on the app's own
 * ground, with the heading in Scoutie Sans above each one.
 */
struct Panel<Content: View>: View {
  var title: String?
  @ViewBuilder var content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let title {
        Text(title)
          .font(Sans.bold(13))
          .foregroundStyle(Brand.muted)
          .padding(.leading, 4)
      }
      VStack(alignment: .leading, spacing: 12) {
        content
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Brand.bg2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Brand.line, lineWidth: 1)
      )
    }
  }
}

/** Field's taller sibling, for a box that text grows inside. */
struct Boxed: ViewModifier {
  func body(content: Content) -> some View {
    content
      .padding(10)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Brand.bg3, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Brand.line, lineWidth: 1)
      )
  }
}

/** The page a sheet sits on: Codera's ground, scrolling, with room at the sides. */
struct Sheeted<Content: View>: View {
  @ViewBuilder var content: Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        content
      }
      .padding(16)
      .frame(maxWidth: 620)
      .frame(maxWidth: .infinity)
    }
    .background(Brand.bg)
    .scrollDismissesKeyboard(.interactively)
  }
}
