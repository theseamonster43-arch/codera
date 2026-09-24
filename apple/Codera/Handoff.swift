import AuthenticationServices
import FirebaseAuth
import SwiftUI

/**
 * Signing in with Google or GitHub, without leaving Codera.
 *
 * Neither provider will do its dance inside an app's own web view — and
 * rightly, since a password typed into a view the app controls is a password
 * the app could read. ASWebAuthenticationSession is the way round that: the
 * sheet is Safari's, drawn over Codera, with its own address bar and its own
 * cookie jar. It sits inside the app, it closes itself when the provider is
 * done, and at no point can Codera see what was typed into it.
 *
 * What comes back is a token from the provider, never a password, and only
 * because the app asked for it: `state` is a fresh random string sent out with
 * the request and required to come back unchanged, so a link arriving from
 * anywhere else is dropped. The web page at /auth.html does the provider's part
 * and hands the token to codera://auth.
 */
@MainActor
final class Handoff: NSObject, ASWebAuthenticationPresentationContextProviding {
  static let shared = Handoff()

  private var session: ASWebAuthenticationSession?

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
#if os(visionOS)
    ASPresentationAnchor()
#else
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow } ?? ASPresentationAnchor()
#endif
  }

  /// Signs in with `google` or `github`. Returns quietly if the person backs out.
  func signIn(with provider: String) async throws {
    let state = Self.freshState()
    var url = URLComponents(string: "https://learncodera.com/auth.html")!
    url.queryItems = [
      URLQueryItem(name: "provider", value: provider),
      URLQueryItem(name: "state", value: state),
    ]

    let back: URL = try await withCheckedThrowingContinuation { carry in
      let session = ASWebAuthenticationSession(
        url: url.url!,
        callbackURLScheme: "codera"
      ) { returned, error in
        if let returned {
          carry.resume(returning: returned)
        } else {
          carry.resume(throwing: error ?? HandoffError.cancelled)
        }
      }
      session.presentationContextProvider = self
      // A session of its own, so signing in here doesn't inherit whoever is
      // signed in to that provider in Safari — and doesn't leave Codera's
      // sign-in sitting in Safari afterwards either.
      session.prefersEphemeralWebBrowserSession = true
      self.session = session
      session.start()
    }

    guard let parts = URLComponents(url: back, resolvingAgainstBaseURL: false),
          let items = parts.queryItems else { throw HandoffError.nothingCameBack }
    let value = { (name: String) in items.first { $0.name == name }?.value }

    // The one check that matters: a link that didn't come from the request we
    // just made is somebody else's link.
    guard value("state") == state else { throw HandoffError.notOurs }
    if let complaint = value("error") { throw HandoffError.refused(complaint) }

    let credential: AuthCredential
    switch value("provider") {
    case "github":
      guard let token = value("accessToken") else { throw HandoffError.nothingCameBack }
      credential = GitHubAuthProvider.credential(withToken: token)
    default:
      guard let token = value("idToken") else { throw HandoffError.nothingCameBack }
      credential = GoogleAuthProvider.credential(withIDToken: token,
                                                 accessToken: value("accessToken") ?? "")
    }

    try await Auth.auth().signIn(with: credential)
  }

  /// 32 random bytes, so a reply can be matched to the request that asked for it.
  private static func freshState() -> String {
    var bytes = [UInt8](repeating: 0, count: 24)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    return Data(bytes).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

enum HandoffError: LocalizedError {
  case cancelled
  case notOurs
  case nothingCameBack
  case refused(String)

  var errorDescription: String? {
    switch self {
    case .cancelled: nil                       // they closed it; not a failure
    case .notOurs: "That sign-in didn't match this one. Try again."
    case .nothingCameBack: "That sign-in didn't finish. Try again."
    case .refused(let why): why
    }
  }
}
