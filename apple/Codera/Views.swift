import SwiftUI

/** Sign in, or the app itself once someone is. */
struct RootView: View {
  @EnvironmentObject var store: Store

  var body: some View {
    Group {
#if DEBUG
      // Launching with -uiPreview 1 shows the shell without signing in, so
      // the tabs and the sheets can be looked at on a simulator. Debug builds
      // only, so it cannot ship, and it grants nothing — every read and write
      // still goes through the rules, which answer an unsigned-in app with
      // nothing.
      if UserDefaults.standard.bool(forKey: "uiPreview") {
        Shell()
      } else if !store.ready {
        ProgressView()
      } else if store.user == nil {
        SignInView()
      } else {
        Shell()
      }
#else
      if !store.ready {
        ProgressView()
      } else if store.user == nil {
        SignInView()
      } else {
        Shell()
      }
#endif
    }
  }
}

/** The mark and the wordmark, the way the website and the Android app wear it. */
struct HomeHeader: View {
  var body: some View {
    HStack(spacing: 10) {
      Mark(size: 30)
      Text("Codera").font(Sans.heavy(19))
      Spacer()
      Image(systemName: "magnifyingglass")
        .font(.system(size: 17, weight: .semibold))
        .frame(width: 38, height: 38)
        .background(.background.secondary, in: Circle())
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 12)
  }
}

/**
 * The feed: one column on a phone, more as the window gets wider — an iPad, a
 * window on a Vision Pro, a phone unfolded.
 */
struct HomeView: View {
  @EnvironmentObject var store: Store

  private let columns = [GridItem(.adaptive(minimum: 320, maximum: 520), spacing: 14, alignment: .top)]

  var body: some View {
    NavigationStack {
      ScrollView {
        HomeHeader().padding(.top, 8)

        if let error = store.loadError {
          ContentUnavailableView("Couldn't load the feed", systemImage: "wifi.exclamationmark", description: Text(error))
            .padding(.top, 40)
        } else if store.posts.isEmpty {
          ProgressView().padding(.top, 60)
        } else {
          LazyVGrid(columns: columns, spacing: 14) {
            ForEach(store.posts) { PostCard(post: $0) }
          }
          .padding(.horizontal, 14)
          .frame(maxWidth: 1180)
          .frame(maxWidth: .infinity)
        }
      }
      .navigationDestination(for: String.self) { ProfileView(uid: $0) }
    }
  }
}

struct PostCard: View {
  let post: Post
  @EnvironmentObject var store: Store

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 9) {
        // The picture and the name open that person's page.
        NavigationLink(value: post.uid) {
          HStack(spacing: 9) {
            Avatar(url: store.photo(for: post), size: 28)
            Text(post.authorName).font(Sans.bold(14)).lineLimit(1)
          }
        }
        .buttonStyle(.plain)
        Spacer(minLength: 6)
        Text(ago(post.createdAt)).font(Sans.medium(12.5)).foregroundStyle(.secondary)
      }

      if !post.title.isEmpty {
        Text(post.title).font(Sans.bold(16))
      }
      if let body = post.body, !body.isEmpty {
        Text(body).font(Sans.regular(14.5)).foregroundStyle(.secondary)
      }

      if let image = post.imageUrl, let url = URL(string: image) {
        AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.gray.opacity(0.15) }
          .frame(height: 180)
          .clipped()
          .clipShape(RoundedRectangle(cornerRadius: 12))
      }

      if post.hasVideo {
        VideoThumb(url: post.videoUrl)
      }

      if let code = post.code, !code.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          if let language = post.language {
            Text(language.uppercased()).font(Sans.bold(11)).foregroundStyle(Brand.blue)
          }
          Text(code).font(.system(.footnote, design: .monospaced)).textSelection(.enabled)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
      }

      HStack(spacing: 16) {
        Label("\(post.likeCount)", systemImage: "hand.thumbsup")
        Label("\(post.dislikeCount)", systemImage: "hand.thumbsdown")
        Label("\(post.commentCount)", systemImage: "bubble")
      }
      .font(Sans.semibold(13))
      .foregroundStyle(.secondary)
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.background.secondary, in: RoundedRectangle(cornerRadius: 16))
    .overlay(RoundedRectangle(cornerRadius: 16).stroke(.separator, lineWidth: 0.5))
  }
}

struct Avatar: View {
  let url: String?
  var size: CGFloat = 28

  var body: some View {
    Group {
      if let url, let link = URL(string: url) {
        AsyncImage(url: link) { $0.resizable().scaledToFill() } placeholder: { Brand.mark }
      } else {
        Brand.mark
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
  }
}

/** Your own page — the same one other people see, with your own things on it. */
struct YouView: View {
  @EnvironmentObject var store: Store

  var body: some View {
    NavigationStack {
      if let uid = store.user?.uid {
        ProfileView(uid: uid, isMe: true)
          .navigationDestination(for: String.self) { ProfileView(uid: $0) }
      } else {
        ProgressView()
      }
    }
  }
}

struct SignInView: View {
  @EnvironmentObject var store: Store
  @State private var email = ""
  @State private var password = ""
  @State private var busy = false
  @State private var error = ""
  @State private var makingAccount = false

  var body: some View {
    VStack(spacing: 16) {
      Mark(size: 86)
      Text("Welcome to Codera").font(Sans.heavy(30))
      Text("Sign in to watch, post and run code from any tutorial.")
        .font(Sans.regular(15)).foregroundStyle(.secondary).multilineTextAlignment(.center)

      TextField("Email", text: $email)
        .textContentType(.emailAddress)
        .textInputAutocapitalization(.never).autocorrectionDisabled()
      SecureField("Password", text: $password).textContentType(.password)

      if !error.isEmpty { Text(error).font(Sans.medium(13)).foregroundStyle(Brand.red) }

      Button(action: go) {
        Text(busy ? "One moment…" : makingAccount ? "Create account" : "Sign in")
      }
      .buttonStyle(BrandButton())
      .disabled(busy || email.isEmpty || password.isEmpty)

      Button(makingAccount ? "I already have an account" : "New to Codera? Create one") {
        makingAccount.toggle()
        error = ""
      }
      .font(Sans.semibold(13.5))
      .tint(Brand.blue)
    }
    .textFieldStyle(.roundedBorder)
    .padding(24)
    .frame(maxWidth: 420)
  }

  private func go() {
    busy = true
    error = ""
    Task {
      do {
        if makingAccount {
          try await store.signUp(email: email, password: password)
        } else {
          try await store.signIn(email: email, password: password)
        }
      } catch {
        self.error = error.localizedDescription
      }
      busy = false
    }
  }
}
