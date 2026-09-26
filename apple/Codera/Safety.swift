import Foundation

/**
 * What can't be said in a comment.
 *
 * The same rule the website and the Android app apply, in the same words: this
 * is the one place Codera stops a child being led off the platform, and a rule
 * that only holds on one of three apps is not a rule. Firestore can't read
 * English, so nothing below is enforced by the database — every client has to
 * carry it.
 *
 * Whoever the post belongs to may point people at their own things: their site,
 * their channel, their community. Phone numbers and email addresses are refused
 * from everyone, including them — those belong on a profile, not in a thread
 * with a stranger.
 */
enum Safety {
  /// Places whose pages are read by everyone, where a link leads somewhere open.
  static let publicPlaces = [
    "github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com", "stackexchange.com",
    "youtube.com", "youtu.be", "x.com", "twitter.com", "linkedin.com", "mastodon.social",
    "dev.to", "medium.com", "npmjs.com", "pypi.org", "codepen.io", "replit.com",
    "instagram.com", "tiktok.com", "twitch.tv", "reddit.com", "bsky.app", "threads.net",
    "patreon.com", "ko-fi.com", "buymeacoffee.com", "substack.com",
    "codesandbox.io", "figma.com", "notion.site", "docs.google.com", "developer.mozilla.org",
    "learncodera.com", "codera-46b86.web.app",
  ]

  /// An invite, or a handle, that opens a conversation with one person.
  private static let privateChannels = [
    #"\b(?:discord\.gg|discordapp\.com/invite|discord\.com/invite)\b"#,
    #"\b(?:t\.me|telegram\.me|wa\.me|api\.whatsapp\.com|ig\.me|m\.me|snapchat\.com/add|join\.skype\.com)\b"#,
    // "my snap is …", "telegram: …", "kik @…"
    #"\b(?:discord|telegram|whatsapp|snap(?:chat)?|kik|signal|skype)\b\s*(?:is|:|@|=|->)\s*\S+"#,
    #"\b(?:add|dm|pm|message)\s+me\s+on\b"#,
  ]

  private static let email = #"[\w.+-]+@[\w-]+\.[a-z]{2,}"#
  /// Seven or more digits together: a phone number however it is spaced out.
  private static let phone = #"(?:\d[\s().-]?){7,}"#
  /// Sizes and hex, which are digits but are not anybody's number.
  private static let notANumber = #"\b\d{1,4}px\b|\b0x[0-9a-f]+\b"#
  private static let linkish = #"(?:https?://|www\.)[^\s<>"']+"#

  private static func has(_ pattern: String, in text: String) -> Bool {
    guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
      return false
    }
    return re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
  }

  /// Every host something in this text points at.
  static func hosts(in text: String) -> [String] {
    guard let re = try? NSRegularExpression(pattern: linkish, options: [.caseInsensitive]) else {
      return []
    }
    return re.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { match in
      guard let span = Range(match.range, in: text) else { return nil }
      let link = String(text[span])
      let full = link.lowercased().hasPrefix("http") ? link : "https://" + link
      guard let host = URLComponents(string: full)?.host else { return link.lowercased() }
      return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
  }

  /// Why this can't be said, or nil when it's fine.
  static func contactProblem(_ text: String, theirs: Bool) -> String? {
    if has(email, in: text) {
      return "Email addresses can\u{2019}t be shared in chat or comments."
    }
    let digitsOnly = (try? NSRegularExpression(pattern: notANumber, options: [.caseInsensitive]))
      .map { re in
        re.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text),
                                    withTemplate: "")
      } ?? text
    if has(phone, in: digitsOnly) {
      return "Phone numbers can\u{2019}t be shared in chat or comments."
    }
    if !theirs, privateChannels.contains(where: { has($0, in: text) }) {
      return "Codera doesn\u{2019}t allow invites to private messaging apps \u{2014} that\u{2019}s how people get led somewhere unsafe. Your GitHub, channel or website is fine."
    }
    if !theirs {
      let strangers = hosts(in: text).filter { host in
        !publicPlaces.contains { host == $0 || host.hasSuffix("." + $0) }
      }
      if !strangers.isEmpty {
        return "Only links to public places like GitHub, YouTube or Stack Overflow can go in chat and comments. Put anything else in your profile or the description."
      }
    }
    return nil
  }
}
