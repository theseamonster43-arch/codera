import SwiftUI

/**
 * Reporting something, and blocking somebody.
 *
 * The same shape the website and the Android app use, because a report that
 * only exists on one of them is a report most people can't make. Nothing here
 * decides anything: it writes what somebody said happened, and the review panel
 * reads it. One report per person per thing — the rules refuse a second, and
 * that refusal is what "you've already reported this" means.
 */
enum Reason: String, CaseIterable, Identifiable {
  case offTopic = "off_topic"
  case inappropriate
  case spam
  case harassment
  case other

  var id: String { rawValue }

  var said: String {
    switch self {
    case .offTopic: return "Not about coding or tech"
    case .inappropriate: return "Inappropriate or unsafe"
    case .spam: return "Spam or a scam"
    case .harassment: return "Harassment or hate"
    case .other: return "Something else"
    }
  }
}

/** What is being reported, which only changes the wording. */
enum Reported: String {
  case post, user, stream, chat

  var named: String {
    switch self {
    case .user: return "this person"
    case .stream: return "this stream"
    case .chat: return "this message"
    case .post: return "this post"
    }
  }
}

struct ReportSheet: View {
  /// The post, stream or person being reported.
  let id: String
  var kind: Reported = .post
  @EnvironmentObject var store: Store
  @Environment(\.dismiss) private var dismiss

  @State private var sending: Reason?
  @State private var problem: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text("Report \(kind.named)")
          .font(Sans.heavy(17))
          .foregroundStyle(Brand.text)
        Spacer(minLength: 8)
        Button { dismiss() } label: { Text("Close").font(Sans.semibold(15)) }
          #if os(visionOS)
          .buttonStyle(.bordered)
          #else
          .buttonStyle(.glass)
          #endif
          .tint(Brand.text)
      }
      .padding(.horizontal, 16)
      .padding(.top, 18)
      .padding(.bottom, 14)
      .background(Brand.bg2)

      Divider().overlay(Brand.line)

      ScrollView {
        VStack(alignment: .leading, spacing: 10) {
          Text("What's wrong? Reports are anonymous. If someone is in danger, tell the police too.")
            .font(Sans.regular(13.5))
            .foregroundStyle(Brand.muted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, 4)

          ForEach(Reason.allCases) { reason in
            Button { send(reason) } label: {
              HStack {
                Text(reason.said).font(Sans.semibold(15)).foregroundStyle(Brand.text)
                Spacer(minLength: 8)
                if sending == reason {
                  ProgressView().tint(Brand.muted)
                }
              }
              .padding(.horizontal, 14)
              .frame(height: 50)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(Brand.bg2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
              .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                  .stroke(Brand.line, lineWidth: 1)
              )
            }
            .buttonStyle(Tappable(scale: 0.98))
            .disabled(sending != nil)
          }

          if let problem {
            Text(problem)
              .font(Sans.medium(13))
              .foregroundStyle(Brand.red)
              .fixedSize(horizontal: false, vertical: true)
          }

          Link("Community Standards", destination: URL(string: "https://learncodera.com/community.html")!)
            .font(Sans.semibold(13.5))
            .tint(Brand.blue)
            .padding(.top, 4)
        }
        .padding(16)
      }
    }
    .background(Brand.ground)
    .presentationDetents([.medium, .large])
    .presentationBackground(Brand.ground)
  }

  private func send(_ reason: Reason) {
    sending = reason
    problem = nil
    Task {
      do {
        try await store.report(id, kind: kind, reason: reason)
        dismiss()
      } catch {
        problem = store.alreadyReported(error)
          ? "You've already reported this."
          : error.localizedDescription
        sending = nil
      }
    }
  }
}

/**
 * Report, and block, from wherever the thing being reported is.
 *
 * Attached as a long press so it is out of the way of everything a card is
 * normally for, and in a menu so the two live together: the answer to "this
 * person keeps doing this" is usually both.
 */
struct SafetyMenu: ViewModifier {
  let post: Post
  @EnvironmentObject var store: Store
  @State private var reporting = false

  func body(content: Content) -> some View {
    content
      .contextMenu {
        if post.uid != store.user?.uid {
          Button("Report post", systemImage: "flag") { reporting = true }
          Button(store.blocked.contains(post.uid) ? "Unblock \(post.authorName)"
                                                  : "Block \(post.authorName)",
                 systemImage: "hand.raised", role: .destructive) {
            Task { await store.toggleBlock(post.uid) }
          }
        }
      }
      .sheet(isPresented: $reporting) { ReportSheet(id: post.id, kind: .post) }
  }
}

extension View {
  /// Report, block or delete, on whatever this is attached to.
  func safety(on post: Post) -> some View { modifier(SafetyMenu(post: post)) }
}
