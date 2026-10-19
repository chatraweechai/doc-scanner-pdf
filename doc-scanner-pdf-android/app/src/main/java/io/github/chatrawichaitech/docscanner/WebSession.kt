package io.github.chatrawichaitech.docscanner

import android.annotation.SuppressLint
import android.content.Context
import android.content.MutableContextWrapper
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebView
import androidx.lifecycle.ViewModel
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * หน้าเว็บของแอป (WebView) และงานที่ค้างอยู่ — เก็บใน ViewModel จึงอยู่รอดเมื่อระบบสร้าง Activity ใหม่ (relaunch)
 * เช่น Android 12+ เปลี่ยนสีธีมตามวอลเปเปอร์ หรือการตั้งค่าอื่นที่ configChanges ในแมนิเฟสต์รับแทนไม่ได้
 * หน้าที่สแกนไว้ในหน้าเว็บจึงไม่หาย — ทิ้งทั้งหมด (onCleared) เมื่อ Activity ปิดจริงเท่านั้น
 *
 * WebView ใช้ context ผ่าน MutableContextWrapper: ชี้ไปที่ Activity ที่แสดงอยู่ และชี้ไปที่ application
 * ระหว่างรอ Activity ใหม่ (ไม่ค้างอ้างถึง Activity ที่ปิดไปแล้ว)
 */
// StaticFieldLeak: ตั้งใจเก็บ WebView และ Activity ปัจจุบันไว้ข้ามการสร้าง Activity ใหม่ — ไม่รั่ว เพราะ detach() ตัดการอ้างถึง
// Activity ทุกครั้งที่ Activity ปิด (context ของ WebView ชี้ไป application) และ onCleared() ทิ้ง WebView เมื่อปิดแอปจริง
@SuppressLint("StaticFieldLeak")
class WebSession : ViewModel() {
    /** Activity ที่แสดงหน้าเว็บอยู่ตอนนี้ (null ระหว่างสร้าง Activity ใหม่) */
    var host: MainActivity? = null

    var webView: WebView? = null
        private set
    private var wrapper: MutableContextWrapper? = null

    lateinit var router: AssetRouter
        private set
    lateinit var transfers: TransferStore
        private set
    val io: ExecutorService = Executors.newSingleThreadExecutor()
    val main = Handler(Looper.getMainLooper())
    val failedTransfers = HashSet<String>()

    /** ภาษาของหน้าเว็บ (UiLanguage) — null = ยังไม่รู้ ใช้ภาษาของเครื่อง */
    var lang: String? = null

    // งานที่รอผลจากหน้าต่างของระบบ — ผลอาจกลับมาที่ Activity ตัวใหม่
    var fileCallback: ValueCallback<Array<Uri>>? = null
    var captureFile: File? = null
    var streamRequest: PermissionRequest? = null
    var pendingSave: PendingSave? = null

    private var started = false

    /** ครั้งแรกของ session เท่านั้น (ไม่ใช่ทุกครั้งที่สร้าง Activity ใหม่ — ไฟล์ที่กำลังส่งอยู่ต้องไม่ถูกลบ) */
    fun start(app: Context, transferDir: File, cleanup: () -> Unit): Boolean {
        if (started) return false
        started = true
        transfers = TransferStore(transferDir)
        lang = UiLanguage.saved(app)
        router = AssetRouter { path -> app.assets.open(path) }
        io.execute(cleanup)
        return true
    }

    /** หน้าเว็บใหม่ (ครั้งแรก หรือหลังตัวประมวลผลหน้าเว็บตาย) */
    fun newWebView(activity: Context): WebView {
        check(webView == null) { "WebView already exists" }
        val w = MutableContextWrapper(activity)
        wrapper = w
        return WebView(w).also { webView = it }
    }

    /** ย้ายหน้าเว็บมาแสดงใน Activity นี้ */
    fun attach(activity: MainActivity) {
        host = activity
        wrapper?.baseContext = activity
        webView?.let { (it.parent as? ViewGroup)?.removeView(it) }
    }

    /** Activity นี้ปิด (หรือกำลังถูกสร้างใหม่) — หน้าเว็บยังอยู่ แต่ไม่อ้างถึง Activity นี้อีก */
    fun detach(activity: MainActivity) {
        if (host !== activity) return
        host = null
        webView?.let { (it.parent as? ViewGroup)?.removeView(it) }
        wrapper?.baseContext = activity.applicationContext
    }

    fun discardWebView() {
        webView?.let {
            (it.parent as? ViewGroup)?.removeView(it)
            it.destroy()
        }
        webView = null
        wrapper = null
    }

    override fun onCleared() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        streamRequest?.deny()
        streamRequest = null
        pendingSave?.transfer?.file?.delete()
        pendingSave = null
        if (started) transfers.abortAll()
        io.shutdown()
        discardWebView()
        host = null
    }
}

class PendingSave(val transfer: TransferStore.Transfer, val reply: (String) -> Unit)
