# KAMBUS Proguard / R8 rules

# Preserve all JavascriptInterface methods exposed to WebView
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve Native TTS Bridge
-keep class com.example.kambus.MainActivity$AndroidTTSBridge {
    public *;
}

# Preserve Firebase Messaging Service
-keep class com.example.kambus.KambusMessagingService {
    public *;
}

# Keep line numbers for debugging stack traces
-keepattributes SourceFile,LineNumberTable
