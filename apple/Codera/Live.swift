import SwiftUI
import WebKit

/**
 * Going live, through the website's studio.
 *
 * Streaming is browser-to-browser (WebRTC, signalled through Firestore), and
 * the website already does it for every platform, the Android app included. So
 * the studio opens here in a web view, in the site's app mode, with the camera
 * and microphone handed straight through.
 */
struct LiveStream: View {
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      StudioWeb(url: URL(string: "https://codera-46b86.web.app/?app=ios#/golive")!)
        .ignoresSafeArea(edges: .bottom)
        .navigationTitle("Go live")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
        }
    }
  }
}

private struct StudioWeb: UIViewRepresentable {
  let url: URL

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = []
    let view = WKWebView(frame: .zero, configuration: config)
    view.uiDelegate = context.coordinator
    view.load(URLRequest(url: url))
    return view
  }

  func updateUIView(_ view: WKWebView, context: Context) {}

  final class Coordinator: NSObject, WKUIDelegate {
    // The page asked for the camera or microphone: Codera already asked iOS.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
      decisionHandler(.grant)
    }
  }
}
