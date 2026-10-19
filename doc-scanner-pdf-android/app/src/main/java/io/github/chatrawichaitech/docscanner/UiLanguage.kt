package io.github.chatrawichaitech.docscanner

import android.content.Context
import android.content.res.Configuration
import androidx.core.content.edit
import java.util.Locale

/**
 * ภาษาของข้อความจากแอป (Toast, หน้าต่างแจ้ง, ข้อผิดพลาดการบันทึก/แชร์) — ใช้ภาษาเดียวกับหน้าเว็บ
 * หน้าเว็บส่งภาษามาทาง DocScannerBridge ({op:"lang"}) ตอนเปิดและเมื่อผู้ใช้กดปุ่มเปลี่ยนภาษา แอปจำไว้ใช้ครั้งต่อไป
 * ยังไม่รู้ภาษา: ตามภาษาของเครื่อง (res/values = อังกฤษ, res/values-th = ไทย)
 */
object UiLanguage {
    private const val PREFS = "ui"
    private const val KEY = "lang"

    /** ภาษาที่หน้าเว็บส่งมาครั้งล่าสุด (null = ยังไม่เคยส่ง) */
    fun saved(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)?.takeIf { it in BridgeProtocol.LANGS }

    fun save(context: Context, lang: String) {
        require(lang in BridgeProtocol.LANGS) { "unsupported language" }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putString(KEY, lang) }
    }

    /** context ที่อ่านข้อความเป็นภาษา lang (null = ภาษาของเครื่อง) */
    fun context(base: Context, lang: String?): Context {
        if (lang == null || lang !in BridgeProtocol.LANGS) return base
        val config = Configuration(base.resources.configuration)
        config.setLocale(Locale.forLanguageTag(lang))
        return base.createConfigurationContext(config)
    }
}
