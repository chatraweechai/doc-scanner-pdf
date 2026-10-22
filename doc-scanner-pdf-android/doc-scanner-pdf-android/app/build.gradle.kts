plugins {
    alias(libs.plugins.android.application)
}

// เลขรุ่นมาจากหัวข้อบนสุดของ CHANGELOG.md ("## v1.0.17 — 2026-09-28") — ที่เดียวกับที่ tools/release/version.js อ่าน
// CI ออก Release ใหม่เฉพาะเมื่อเลขนี้ใหม่และแอปเปลี่ยนจริง; versionCode = major×1,000,000 + minor×1,000 + patch
val changelog = rootProject.layout.projectDirectory.file("../CHANGELOG.md")
val appVersionName: String = providers.fileContents(changelog).asText.get().let { text ->
    Regex("""(?m)^## v(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?=\s)""").find(text)?.let { m -> m.groupValues.drop(1).joinToString(".") }
        ?: error("CHANGELOG.md has no version heading (## v1.0.N — date)")
}
val appVersionCode: Int = appVersionName.split(".").map { it.toInt() }.let { (major, minor, patch) ->
    major * 1_000_000 + minor * 1_000 + patch
}

// กุญแจเซ็นแอปถาวร (GitHub secrets) — ถ้าไม่มี release จะเซ็นด้วยกุญแจ debug ของเครื่องที่ build
val releaseKeystore = providers.environmentVariable("ANDROID_KEYSTORE_FILE").orNull
val hasReleaseKey = !releaseKeystore.isNullOrBlank() && file(releaseKeystore).exists()

android {
    namespace = "io.github.chatrawichaitech.docscanner"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.chatrawichaitech.docscanner"
        minSdk = 26
        // Android 16 — รุ่นล่าสุดที่ทดสอบแอปจริงบน emulator ใน CI ได้ (image ของ Android 17 ยังไม่เสถียร)
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = file(releaseKeystore!!)
                storePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("ANDROID_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (hasReleaseKey) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true // BuildConfig.VERSION_NAME → เลขรุ่นที่หน้าเว็บแสดง
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
        // เวอร์ชันไลบรารีตรวจแยกต่างหาก ไม่ให้ build ล้มเพราะมีรุ่นใหม่ออกมา
        disable += setOf("GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion")
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
        animationsDisabled = true
    }
}

dependencies {
    implementation(libs.androidx.activity)
    implementation(libs.androidx.core)
    implementation(libs.androidx.webkit)

    testImplementation(libs.junit)
    testImplementation(libs.json)

    androidTestImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.core)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.espresso.core)
    androidTestImplementation(libs.espresso.intents)
    androidTestImplementation(libs.uiautomator)
}
