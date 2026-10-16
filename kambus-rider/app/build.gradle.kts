plugins {
    alias(libs.plugins.android.application)
    id("com.google.gms.google-services")
}

android {
    namespace = "com.example.kambus"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.kambus.rider"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.webkit:webkit:1.12.0")
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)

    // Testing
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)

    // Firebase Cloud Messaging
    implementation(platform("com.google.firebase:firebase-bom:34.17.0"))
    implementation("com.google.firebase:firebase-messaging")
}

val checkCss = tasks.register<Exec>("checkCss") {
    group = "verification"
    description = "Validates that CSS in web assets has balanced braces and valid syntax"

    val isWindows = System.getProperty("os.name").lowercase().contains("windows")
    val scriptFile = rootProject.file("scripts/check-css.js")

    if (isWindows) {
        commandLine("cmd.exe", "/c", "node", scriptFile.absolutePath)
    } else {
        commandLine("node", scriptFile.absolutePath)
    }

    doFirst {
        val nodeCheckCmd = if (isWindows) listOf("cmd.exe", "/c", "node", "-v") else listOf("node", "-v")
        val hasNode = try {
            val process = ProcessBuilder(nodeCheckCmd)
                .redirectErrorStream(true)
                .start()
            process.waitFor() == 0
        } catch (e: Exception) {
            false
        }

        if (!hasNode) {
            println("WARNING: Node.js is not installed or not in PATH. Skipping CSS balance check.")
            if (isWindows) {
                commandLine("cmd.exe", "/c", "exit", "0")
            } else {
                commandLine("true")
            }
        }
    }
}

tasks.named("preBuild") {
    dependsOn(checkCss)
}
