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
    // Codera's own ground, accent and ink, rather than whatever iOS would pick.
    // Set once here so every screen inherits it instead of each one remembering.
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Brand.bg)
    .tint(Brand.blue)
    .foregroundStyle(Brand.text)
  }
}

/** The mark and the wordmark, the way the website and the Android app wear it. */
struct HomeHeader: View {
  var body: some View {
    HStack(spacing: 10) {
      Mark(size: 30)
      Text("Codera").font(Sans.heavy(19))
      Spacer()
      Glyph(path: Ink.search, weight: 2, size: 19)
        .frame(width: 38, height: 38)
        .background(Brand.bg2, in: Circle())
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
          VStack(alignment: .leading, spacing: 18) {
            // Shorts run along their own shelf rather than down the column: a
            // tall card in a column of wide ones is a page of one short.
            if !store.shorts.isEmpty {
              ShortsShelf(shorts: Array(store.shorts.prefix(12)))
            }

            LazyVGrid(columns: columns, spacing: 14) {
              ForEach(store.posts.filter { $0.type != "short" }) { FeedCard(post: $0) }
            }
            .padding(.horizontal, 14)
          }
          .frame(maxWidth: Brand.readable)
          .frame(maxWidth: .infinity)
        }
      }
      .navigationDestination(for: String.self) { ProfileView(uid: $0) }
      .navigationDestination(for: Watching.self) { WatchPage(post: $0.post) }
    }
  }
}

struct PostCard: View {
  let post: Post
  @EnvironmentObject var store: Store
  @State private var talking = false

  private var mine: Int { store.myVotes[post.id] ?? 0 }

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
        .buttonStyle(Tappable())
        Spacer(minLength: 6)
        Text(ago(post.createdAt)).font(Sans.medium(12.5)).foregroundStyle(Brand.muted)
      }

      if !post.title.isEmpty {
        Text(post.title).font(Sans.bold(16))
      }
      if let body = post.body, !body.isEmpty {
        Text(body).font(Sans.regular(14.5)).foregroundStyle(Brand.muted)
      }

      if !post.imageUrls.isEmpty {
        Gallery(urls: post.imageUrls)
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
        .background(Brand.bg3, in: RoundedRectangle(cornerRadius: 10))
      }

      // All three do something: the thumbs vote, the count opens what it is
      // counting. They were labels, which is why nothing happened.
      HStack(spacing: 16) {
        Button { Task { await store.vote(post.id, 1) } } label: {
          tally(Ink.up, post.likeCount + (mine == 1 ? 1 : 0), on: mine == 1)
        }
        .buttonStyle(Tappable())

        Button { Task { await store.vote(post.id, -1) } } label: {
          tally(Ink.up, post.dislikeCount + (mine == -1 ? 1 : 0), on: mine == -1, over: true)
        }
        .buttonStyle(Tappable())

        Button { talking = true } label: {
          tally(Ink.comment, post.commentCount)
        }
        .buttonStyle(Tappable())
      }
      .font(Sans.semibold(13))
      .foregroundStyle(Brand.muted)
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Brand.bg2, in: RoundedRectangle(cornerRadius: 16))
    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Brand.line, lineWidth: 1))
    .sheet(isPresented: $talking) { CommentSheet(post: post) }
    .task(id: post.id) { await store.loadVote(post.id) }
  }
}

extension PostCard {
  /// A count with Codera's own glyph beside it.
  fileprivate func tally(_ glyph: String, _ n: Int, on: Bool = false,
                         over: Bool = false) -> some View {
    HStack(spacing: 5) {
      Glyph(path: glyph, filled: on, weight: 1.7, size: 17)
        .rotationEffect(.degrees(over ? 180 : 0))
      Text(compact(n))
    }
    .foregroundStyle(on ? Brand.blue : Brand.muted)
    .scaleEffect(on ? 1.08 : 1)
    .animation(.spring(response: 0.3, dampingFraction: 0.5), value: on)
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
          .navigationDestination(for: Watching.self) { WatchPage(post: $0.post) }
      } else {
        ProgressView()
      }
    }
  }
}

/** Each provider's own mark, in the weight the rest of the screen is drawn at. */
struct ProviderMark: View {
  let which: String

  var body: some View {
    Group {
      if which == "github" {
        Image(systemName: "chevron.left.forwardslash.chevron.right")
          .font(.system(size: 15, weight: .bold))
      } else {
        // Google's G, in Google's four colours, which is the one mark they ask
        // not to be recoloured.
        Text("G")
          .font(.system(size: 19, weight: .bold, design: .rounded))
          .foregroundStyle(
            LinearGradient(
              colors: [Color(red: 0.92, green: 0.26, blue: 0.21),
                       Color(red: 0.98, green: 0.74, blue: 0.02),
                       Color(red: 0.20, green: 0.66, blue: 0.33),
                       Color(red: 0.26, green: 0.52, blue: 0.96)],
              startPoint: .topLeading, endPoint: .bottomTrailing
            )
          )
      }
    }
    .frame(width: 22, height: 22)
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
        .font(Sans.regular(15)).foregroundStyle(Brand.muted).multilineTextAlignment(.center)

      TextField("Email", text: $email)
        .textContentType(.emailAddress)
        .textInputAutocapitalization(.never).autocorrectionDisabled()
        .modifier(Field())
      SecureField("Password", text: $password)
        .textContentType(.password)
        .modifier(Field())

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

      // The other ways in. The sheet is Safari's, drawn over Codera and closing
      // itself when the provider is done — neither Google nor GitHub will sign
      // anyone in inside a view the app controls, and nor should they.
      HStack(spacing: 10) {
        Rectangle().fill(Brand.line).frame(height: 1)
        Text("or").font(Sans.medium(12)).foregroundStyle(Brand.muted)
        Rectangle().fill(Brand.line).frame(height: 1)
      }
      .padding(.vertical, 2)

      provider("Continue with Google", "google")
      provider("Continue with GitHub", "github")
    }
    .padding(24)
    .frame(maxWidth: 420)
  }

  private func provider(_ title: String, _ which: String) -> some View {
    Button {
      busy = true
      error = ""
      Task {
        do {
          try await Handoff.shared.signIn(with: which)
        } catch {
          // Backing out of the sheet is not a failure and says nothing.
          if let words = error.localizedDescription as String?, !words.isEmpty {
            self.error = words
          }
        }
        busy = false
      }
    } label: {
      HStack(spacing: 10) {
        ProviderMark(which: which)
        Text(title).font(Sans.semibold(15))
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 16)
      .frame(maxWidth: .infinity, minHeight: 50)
    }
    .buttonStyle(Tappable())
    .foregroundStyle(.primary)
    .background(Brand.bg2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Brand.line, lineWidth: 1)
    )
    .disabled(busy)
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

/** A text field the way Codera draws one: tall, soft, and quiet until used. */
struct Field: ViewModifier {
  func body(content: Content) -> some View {
    content
      .font(Sans.regular(15.5))
      .padding(.horizontal, 14)
      .frame(height: 50)
      .background(Brand.bg2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Brand.line, lineWidth: 1)
      )
  }
}
