# Makes apple/Codera.xcodeproj from the sources next to it.
#
# The project file isn't kept in git: this script is, so the project can be
# rebuilt from scratch and never drifts into a mess of merge conflicts.
# Run it with: ruby apple/project.rb   (needs the xcodeproj gem)
require 'xcodeproj'
require 'fileutils'

root = File.dirname(__FILE__)
path = File.join(root, 'Codera.xcodeproj')
FileUtils.rm_rf(path)
project = Xcodeproj::Project.new(path)

BUNDLE_ID = 'com.codera'.freeze
DEPLOYMENT = { 'IPHONEOS_DEPLOYMENT_TARGET' => '26.0', 'XROS_DEPLOYMENT_TARGET' => '26.0' }.freeze

target = project.new_target(:application, 'Codera', :ios, '26.0')

# iPhone, iPad and — natively, not as an iPad app in a window — Vision Pro.
target.build_configurations.each do |config|
  config.build_settings.merge!(DEPLOYMENT)
  config.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER' => BUNDLE_ID,
    'PRODUCT_NAME' => 'Codera',
    'MARKETING_VERSION' => '1.0',
    'CURRENT_PROJECT_VERSION' => '1',
    'SUPPORTED_PLATFORMS' => 'iphoneos iphonesimulator xros xrsimulator',
    'SUPPORTS_MACCATALYST' => 'NO',
    'TARGETED_DEVICE_FAMILY' => '1,2,7',        # iPhone, iPad, Vision
    'SWIFT_VERSION' => '5.0',
    'INFOPLIST_FILE' => 'Codera/Info.plist',
    'ENABLE_PREVIEWS' => 'YES',
    'GENERATE_INFOPLIST_FILE' => 'NO',
    'CODE_SIGN_STYLE' => 'Automatic',
    'ASSETCATALOG_COMPILER_APPICON_NAME' => 'AppIcon',
    # A Vision Pro icon is a stack the system lights and moves apart, not a
    # flat picture, so that platform gets its own asset.
    'ASSETCATALOG_COMPILER_APPICON_NAME[sdk=xros*]' => 'AppIconVision',
    'ASSETCATALOG_COMPILER_APPICON_NAME[sdk=xrsimulator*]' => 'AppIconVision',
    'CODE_SIGN_ENTITLEMENTS' => 'Codera/Codera.entitlements',
    'DEVELOPMENT_TEAM' => ENV.fetch('CODERA_TEAM', ''),
  )
end

group = project.new_group('Codera', 'Codera')
sources = Dir.glob(File.join(root, 'Codera', '*.swift')).sort
sources.each { |file| target.add_file_references([group.new_reference(File.basename(file))]) }

# Firebase's own config and anything else the app carries.
# Scoutie Sans, the same faces the website and the Android app use.
fonts = project.new_group('Fonts', 'Codera/Fonts')
Dir.glob(File.join(root, 'Codera', 'Fonts', '*.ttf')).sort.each do |file|
  target.add_resources([fonts.new_reference(File.basename(file))])
end

target.add_resources([group.new_reference('Assets.xcassets')])

%w[GoogleService-Info.plist].each do |name|
  next unless File.exist?(File.join(root, 'Codera', name))

  target.add_resources([group.new_reference(name)])
end

# Firebase, through Swift Package Manager.
package = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
package.repositoryURL = 'https://github.com/firebase/firebase-ios-sdk'
package.requirement = { 'kind' => 'upToNextMajorVersion', 'minimumVersion' => '12.0.0' }
project.root_object.package_references << package

%w[FirebaseAuth FirebaseFirestore FirebaseStorage FirebaseFunctions].each do |product|
  dependency = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
  dependency.package = package
  dependency.product_name = product
  target.package_product_dependencies << dependency

  build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
  build_file.product_ref = dependency
  target.frameworks_build_phase.files << build_file
end

project.save
puts "wrote #{path} (#{sources.length} Swift files)"
