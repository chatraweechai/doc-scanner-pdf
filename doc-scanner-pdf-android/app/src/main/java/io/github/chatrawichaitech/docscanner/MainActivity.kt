package io.github.chatrawichaitech.docscanner

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import io.github.chatrawichaitech.docscanner.BridgeProtocol.Message
import io.github.chatrawichaitech.docscanner.BridgeProtocol.ProtocolException
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.util.UUID
import kotlin.math.roundToInt

/**
 * แอปสแกนเอกสาร: หน้าเว็บ doc-scanner-pdf (จาก repo chatraweechai/doc-scanner-pdf-code, อยู่ใน assets/www) ใน WebView
 * แอปเพิ่มเฉพาะสิ่งที่ WebView ทำเองไม่ได้ — สิทธิ์กล้อง, กล้องของเครื่อง/เลือกรูป, บันทึก/แชร์ไฟล์, ปุ่มย้อนกลับ
 * หน้าเว็บและงานที่ค้างอยู่อยู่ใน WebSession (ViewModel) — ระบบสร้าง Activity ใหม่แล้วหน้าที่สแกนไว้ไม่หาย
 */
class MainActivity : ComponentActivity() {

    private val session: WebSession by viewModels()

    /** ใช้ในการทดสอบ (androidTest) */
    internal val webView: WebView
        get() = session.webView ?: error("no WebView")
    private lateinit var root: FrameLayout
    private val router get() = session.router
    private val transfers get() = session.transfers
    private val io get() = session.io
    private val failedTransfers get() = session.failedTransfers

    private var fileCallback: ValueCallback<Array<Uri>>?
        get() = session.fileCallback
        set(v) { session.fileCallback = v }
    private var captureFile: File?
        get() = session.captureFile
        set(v) { session.captureFile = v }
    private var streamRequest: PermissionRequest?
        get() = session.streamRequest
        set(v) { session.streamRequest = v }
    private var pendingSave: PendingSave?
        get() = session.pendingSave
        set(v) { session.pendingSave = v }

    // ---------- ผลจากหน้าต่างของระบบ (ลงทะเบียนก่อน onStart ตามข้อกำหนดของ Activity Result API) ----------
    private val streamPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val request = streamRequest ?: return@registerForActivityResult
        streamRequest = null
        if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else request.deny()
    }
    private val capturePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (fileCallback == null) return@registerForActivityResult
        if (granted) {
            launchCamera()
        } else {
            toast(R.string.camera_denied_picker)
            launchPicker(false)
        }
    }
    private val takePicture = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val file = captureFile
        captureFile = null
        if (ok && file != null && file.length() > 0) {
            deliverFiles(arrayOf(uriFor(file)))
        } else {
            file?.delete()
            deliverFiles(null)
        }
    }
    private val pickImages = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        deliverFiles(uris.takeIf { it.isNotEmpty() }?.toTypedArray())
    }
    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        deliverFiles(uri?.let { arrayOf(it) })
    }
    private val pickPdf = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        deliverFiles(uri?.let { arrayOf(it) })
    }
    // หน้าต่าง "บันทึกเป็น" ของระบบ แยกตามชนิดไฟล์ (ต้องลงทะเบียนทุกชนิดตอนสร้าง Activity)
    private val saveLaunchers = FileNames.EXTENSIONS.keys.associateWith { mime ->
        registerForActivityResult(ActivityResultContracts.CreateDocument(mime)) { onSaveResult(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val app = applicationContext
        session.start(app, File(cacheDir, TRANSFER_DIR)) { cleanTemporaryFiles(app) }

        root = FrameLayout(this)
        val existing = session.webView
        session.attach(this)
        val view = if (existing != null) {
            // ระบบสร้าง Activity ใหม่ (เช่น เปลี่ยนสีธีมของระบบ) — ใช้หน้าเว็บเดิม หน้าที่สแกนไว้ยังอยู่
            Log.i(TAG, "activity recreated — keeping the page (${resources.configuration})")
            existing
        } else {
            session.newWebView(this).also { configureWebView(it) }
        }
        // client ผูกกับ Activity นี้ (ตั้งใหม่ทุกครั้งที่สร้าง Activity ใหม่)
        view.webViewClient = AppWebViewClient()
        view.webChromeClient = AppChromeClient()
        view.settings.textZoom = textZoomFor(resources.configuration)
        root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        // หน้าเว็บอยู่ในพื้นที่ที่ไม่ถูกแถบระบบ รอยบากจอ หรือแป้นพิมพ์บัง
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime(),
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, backCallback)

        if (existing == null) {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                AlertDialog.Builder(this).setMessage(text(R.string.webview_outdated)).setPositiveButton(text(R.string.ok), null).show()
            }
            view.loadUrl(AssetRouter.START_URL)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(view: WebView) {
        val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        WebView.setWebContentsDebuggingEnabled(debuggable)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true            // localStorage: การตั้งค่า OCR/PDF และสถานะสิทธิ์กล้อง
            allowFileAccess = false
            allowContentAccess = false
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            setGeolocationEnabled(false)
            mediaPlaybackRequiresUserGesture = false  // วิดีโอจากกล้องในแอป (ไม่มีเสียง)
            // เลขรุ่นของแอป (v1.0.N) ให้หน้าเว็บแสดงแทนเลข commit — AppPlatform.versionLabel ใน android/platform.js
            // (user agent ไม่ถูกส่งไปที่ใด: แอปไม่มีสิทธิ์อินเทอร์เน็ต และหน้าเว็บโหลดจาก assets ในแอปเท่านั้น)
            userAgentString = AppVersion.userAgent(userAgentString, BuildConfig.VERSION_NAME)
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(view.settings, false) // หน้าเว็บมีโหมดมืดของตัวเอง
        }
        view.setDownloadListener { _, _, _, _, _ -> Log.w(TAG, "ignored web download (saveFile hook not used?)") }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // ลงทะเบียนครั้งเดียวต่อหน้าเว็บ — ส่งต่อให้ Activity ที่แสดงอยู่ตอนนั้น (ไม่อ้างถึง Activity นี้โดยตรง)
            val s = session
            WebViewCompat.addWebMessageListener(view, BRIDGE_NAME, setOf(AssetRouter.ORIGIN)) { _, message, origin, isMainFrame, reply ->
                if (isMainFrame && origin.scheme == "https" && origin.host == AssetRouter.HOST) s.host?.onBridgeMessage(message, reply)
            }
        }
    }

    private fun textZoomFor(config: Configuration): Int = (config.fontScale * 100).roundToInt().coerceIn(85, 200)

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        session.webView?.settings?.textZoom = textZoomFor(newConfig)
    }

    override fun onDestroy() {
        // สร้าง Activity ใหม่ → หน้าเว็บและงานที่ค้างอยู่ไปต่อที่ Activity ใหม่; ปิดจริง → WebSession.onCleared ทิ้งทั้งหมด
        Log.i(TAG, "activity destroyed (finishing=$isFinishing, changingConfigurations=$isChangingConfigurations)")
        session.detach(this)
        super.onDestroy()
    }

    // ---------- ปุ่มย้อนกลับ: ให้หน้าเว็บจัดการก่อน (ปิดหน้าต่าง/กลับหน้าหลัก) ----------
    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() = onBack()
    }

    private fun onBack() {
        Log.i(TAG, "back pressed")
        val view = session.webView ?: return
        view.evaluateJavascript(BACK_SCRIPT) { result ->
            val page = try {
                JSONObject(JSONTokener(result).nextValue() as String)
            } catch (e: Exception) {
                JSONObject() // หน้าเว็บยังไม่พร้อม/ผิดพลาด → ถือว่าไม่ได้จัดการ
            }
            val handled = page.optBoolean("handled", false)
            Log.i(TAG, "back: $page")
            if (handled || isFinishing || isDestroyed) return@evaluateJavascript
            // หน้าหลักแล้ว: ย้ายแอปไปทำงานเบื้องหลัง (ไม่ปิด) — หน้าที่สแกนไว้ยังอยู่เมื่อกลับมา
            val moved = moveTaskToBack(true)
            Log.i(TAG, "back on the home screen: moveTaskToBack=$moved")
            if (!moved) {
                // บางอุปกรณ์ (เช่น แท็บเล็ต) ย้ายไม่ได้ → ใช้การย้อนกลับปกติของระบบ (Android 12+ ย้ายไปเบื้องหลังเหมือนกัน)
                backCallback.isEnabled = false
                onBackPressedDispatcher.onBackPressed()
                backCallback.isEnabled = true
            }
        }
    }

    // ---------- WebView ----------
    // onRenderProcessGone มีอยู่ด้านล่าง — lint เตือนผิดเพราะเห็นการเรียก constructor WebViewClient() ของ Kotlin
    @SuppressLint("MissingOnRenderProcessGone")
    private inner class AppWebViewClient : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
            val url = request.url
            val r = router.route(url.scheme, url.host, url.path, request.method)
            return WebResourceResponse(r.mimeType, r.encoding, r.status, r.reason, r.headers, r.body)
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (AssetRouter.isAppUrl(url.scheme, url.host)) return false
            // ลิงก์ภายนอกที่ผู้ใช้แตะ → เปิดในเบราว์เซอร์ (เฉพาะ https)
            if (request.isForMainFrame && request.hasGesture() && url.scheme == "https") {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE))
                } catch (e: ActivityNotFoundException) {
                    toast(R.string.cannot_open_link)
                }
            }
            return true
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // ตัวประมวลผลหน้าเว็บถูกปิด (มักเพราะหน่วยความจำไม่พอ) — สร้างหน้าใหม่แทนการปิดแอป
            Log.e(TAG, "WebView renderer gone, crashed=${detail.didCrash()}")
            if (view !== session.webView) return true
            session.discardWebView()
            toast(R.string.page_reloaded)
            recreate() // Activity ใหม่สร้างหน้าเว็บใหม่ (session ไม่มี WebView แล้ว)
            return true
        }
    }

    private inner class AppChromeClient : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            val origin = request.origin
            val fromApp = origin != null && AssetRouter.isAppUrl(origin.scheme, origin.host)
            // อนุญาตเฉพาะกล้อง (ไม่มีไมโครโฟน) และเฉพาะหน้าเว็บของแอป
            if (!fromApp || request.resources.toSet() != setOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                request.deny()
                return
            }
            if (hasCameraPermission()) {
                request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
            } else {
                streamRequest?.deny()
                streamRequest = request
                streamPermission.launch(Manifest.permission.CAMERA)
            }
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            if (streamRequest === request) streamRequest = null
        }

        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            deliverFiles(null) // ยกเลิกหน้าต่างเลือกไฟล์ที่ค้างอยู่ (ถ้ามี)
            fileCallback = callback
            if (params.isCaptureEnabled) {
                if (hasCameraPermission()) launchCamera() else capturePermission.launch(Manifest.permission.CAMERA)
            } else if (wantsPdf(params.acceptTypes)) {
                launchPdfPicker()
            } else {
                launchPicker(params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
            }
            return true
        }
    }

    private fun hasCameraPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun uriFor(file: File): Uri = FileProvider.getUriForFile(this, "$packageName.files", file)

    private fun launchCamera() {
        try {
            val dir = File(cacheDir, CAMERA_DIR).apply { mkdirs() }
            val file = File(dir, "IMG_${System.currentTimeMillis()}.jpg")
            captureFile = file
            takePicture.launch(uriFor(file))
        } catch (e: ActivityNotFoundException) {
            captureFile = null
            toast(R.string.no_camera_app)
            launchPicker(false)
        } catch (e: IOException) {
            captureFile = null
            Log.e(TAG, "camera file", e)
            launchPicker(false)
        }
    }

    /** ช่องเลือกไฟล์ที่รับเฉพาะ PDF (หน้าต่าง "แปลงไฟล์ PDF") — accept="application/pdf,.pdf" */
    private fun wantsPdf(accept: Array<String>?): Boolean {
        val types = accept.orEmpty().map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        return types.isNotEmpty() && types.all { it == "application/pdf" || it == ".pdf" }
    }

    private fun launchPdfPicker() {
        try {
            pickPdf.launch("application/pdf")
        } catch (e: ActivityNotFoundException) {
            toast(R.string.no_picker_app)
            deliverFiles(null)
        }
    }

    private fun launchPicker(multiple: Boolean) {
        try {
            if (multiple) pickImages.launch("image/*") else pickImage.launch("image/*")
        } catch (e: ActivityNotFoundException) {
            toast(R.string.no_picker_app)
            deliverFiles(null)
        }
    }

    /** ส่งไฟล์ที่เลือกให้หน้าเว็บ (ต้องเรียก callback ทุกครั้ง ไม่งั้นเลือกไฟล์ครั้งต่อไปไม่ได้) */
    private fun deliverFiles(uris: Array<Uri>?) {
        val cb = fileCallback ?: return
        fileCallback = null
        cb.onReceiveValue(uris)
    }

    // ---------- สะพานจากหน้าเว็บ: บันทึก/แชร์ไฟล์ ----------
    private fun onBridgeMessage(message: WebMessageCompat, replyProxy: JavaScriptReplyProxy) {
        // ตอบกลับหน้าเว็บ (ซึ่งอาจอยู่ต่อใน Activity ใหม่) — ไม่อ้างถึง Activity นี้
        val s = session
        val app = applicationContext
        val reply: (String) -> Unit = { json ->
            s.main.post {
                if (s.webView != null && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) replyProxy.postMessage(json)
            }
        }
        val msg = try {
            BridgeProtocol.parse(message.data)
        } catch (e: ProtocolException) {
            Log.w(TAG, "bridge: ${e.message}")
            e.id?.let { id -> if (failedTransfers.add(id)) reply(BridgeProtocol.error(id, e.message ?: "")) }
            return
        }
        if (msg is Message.ShareText) {
            shareText(msg, reply)
            return
        }
        if (msg is Message.Lang) {
            s.lang = msg.lang
            UiLanguage.save(app, msg.lang)
            reply(BridgeProtocol.ok(msg.id, "lang"))
            return
        }
        if (msg.id in failedTransfers) return // ชิ้นที่เหลือของไฟล์ที่ล้มเหลวไปแล้ว
        io.execute {
            try {
                when (msg) {
                    is Message.Begin -> s.transfers.begin(msg)
                    is Message.Chunk -> s.transfers.chunk(msg)
                    is Message.End -> {
                        val t = s.transfers.end(msg)
                        s.main.post {
                            val host = s.host
                            when {
                                host == null -> {
                                    t.file.delete()
                                    reply(BridgeProtocol.error(t.id, UiLanguage.context(app, s.lang).getString(R.string.transfer_failed)))
                                }
                                t.kind == BridgeProtocol.Kind.SAVE -> host.startSave(t, reply)
                                else -> host.startShare(t, reply)
                            }
                        }
                    }
                    is Message.ShareText, is Message.Lang -> Unit
                }
            } catch (e: Exception) {
                Log.w(TAG, "transfer ${msg.id}: ${e.message}")
                s.transfers.abort(msg.id)
                val error = (e as? ProtocolException)?.message ?: UiLanguage.context(app, s.lang).getString(R.string.transfer_failed)
                s.main.post { if (s.failedTransfers.add(msg.id)) reply(BridgeProtocol.error(msg.id, error)) }
            }
        }
    }

    private fun startSave(t: TransferStore.Transfer, reply: (String) -> Unit) {
        if (pendingSave != null) {
            t.file.delete()
            reply(BridgeProtocol.error(t.id, text(R.string.save_busy)))
            return
        }
        pendingSave = PendingSave(t, reply)
        try {
            (saveLaunchers[t.mime] ?: throw ActivityNotFoundException(t.mime)).launch(t.name)
        } catch (e: ActivityNotFoundException) {
            pendingSave = null
            t.file.delete()
            reply(BridgeProtocol.error(t.id, text(R.string.save_unavailable)))
        }
    }

    private fun onSaveResult(uri: Uri?) {
        val p = pendingSave ?: return
        pendingSave = null
        val t = p.transfer
        if (uri == null) {
            t.file.delete()
            p.reply(BridgeProtocol.ok(t.id, "cancelled"))
            return
        }
        val resolver = applicationContext.contentResolver
        val failed = text(R.string.save_failed)
        io.execute {
            try {
                val out = try {
                    resolver.openOutputStream(uri, "wt")
                } catch (e: FileNotFoundException) {
                    resolver.openOutputStream(uri, "w")
                } catch (e: IllegalArgumentException) {
                    resolver.openOutputStream(uri, "w") // ผู้ให้บริการบางรายไม่รองรับโหมด "wt"
                } ?: throw IOException("openOutputStream returned null")
                out.use { o -> t.file.inputStream().use { it.copyTo(o) } }
                p.reply(BridgeProtocol.ok(t.id, "saved"))
            } catch (e: Exception) {
                Log.e(TAG, "save", e)
                p.reply(BridgeProtocol.error(t.id, failed))
            } finally {
                t.file.delete()
            }
        }
    }

    private fun startShare(t: TransferStore.Transfer, reply: (String) -> Unit) {
        val shareDir = File(cacheDir, SHARE_DIR)
        val failed = text(R.string.no_share_app)
        io.execute {
            try {
                val dest = File(shareDir, UUID.randomUUID().toString()).apply { mkdirs() }.let { File(it, t.name) }
                if (!t.file.renameTo(dest)) {
                    t.file.copyTo(dest, overwrite = true)
                    t.file.delete()
                }
                onHost(t.id, reply) { it.sendShareIntent(Intent(Intent.ACTION_SEND).setType(t.mime), dest, t.id, reply) }
            } catch (e: IOException) {
                t.file.delete()
                reply(BridgeProtocol.error(t.id, failed))
            }
        }
    }

    /** งานที่ต้องใช้ Activity หลังทำงานเบื้องหลังเสร็จ — ทำใน Activity ที่แสดงอยู่ตอนนั้น (อาจเป็นตัวใหม่) */
    private fun onHost(id: String, reply: (String) -> Unit, work: (MainActivity) -> Unit) {
        val s = session
        val failed = text(R.string.no_share_app)
        s.main.post {
            val host = s.host
            if (host != null) work(host) else reply(BridgeProtocol.error(id, failed))
        }
    }

    private fun shareText(m: Message.ShareText, reply: (String) -> Unit) {
        if (m.text.length <= MAX_INTENT_TEXT) {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, m.text)
            if (m.title.isNotBlank()) send.putExtra(Intent.EXTRA_SUBJECT, m.title.take(200))
            startChooser(send, m.id, reply)
            return
        }
        // ข้อความยาวมากเกินขนาดที่ส่งผ่าน Intent ได้ → แชร์เป็นไฟล์ .txt แทน
        val shareDir = File(cacheDir, SHARE_DIR)
        val failed = text(R.string.no_share_app)
        io.execute {
            try {
                val name = FileNames.sanitize(m.title, "text/plain")
                val dest = File(shareDir, UUID.randomUUID().toString()).apply { mkdirs() }.let { File(it, name) }
                dest.writeText(m.text)
                onHost(m.id, reply) { it.sendShareIntent(Intent(Intent.ACTION_SEND).setType("text/plain"), dest, m.id, reply) }
            } catch (e: IOException) {
                reply(BridgeProtocol.error(m.id, failed))
            }
        }
    }

    private fun sendShareIntent(send: Intent, file: File, id: String, reply: (String) -> Unit) {
        val uri = uriFor(file)
        send.putExtra(Intent.EXTRA_STREAM, uri)
        send.clipData = ClipData.newRawUri(file.name, uri)
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        startChooser(send, id, reply)
    }

    private fun startChooser(send: Intent, id: String, reply: (String) -> Unit) {
        try {
            startActivity(Intent.createChooser(send, text(R.string.share_title)))
            reply(BridgeProtocol.ok(id, "shared"))
        } catch (e: ActivityNotFoundException) {
            reply(BridgeProtocol.error(id, text(R.string.no_share_app)))
        }
    }

    /** ลบไฟล์ชั่วคราวของครั้งก่อน (รูปจากกล้องที่หน้าเว็บอ่านไปแล้ว, ไฟล์ที่แชร์เกิน 1 ชั่วโมง) — เมื่อเริ่ม session */
    private fun cleanTemporaryFiles(app: Context) {
        val cache = app.cacheDir
        val hourAgo = System.currentTimeMillis() - 3_600_000L
        File(cache, TRANSFER_DIR).listFiles()?.forEach { it.deleteRecursively() }
        listOf(CAMERA_DIR, SHARE_DIR).forEach { dir ->
            File(cache, dir).listFiles()?.forEach { if (it.lastModified() < hourAgo) it.deleteRecursively() }
        }
    }

    private fun toast(res: Int) = Toast.makeText(this, text(res), Toast.LENGTH_LONG).show()

    /** ข้อความของแอปในภาษาเดียวกับหน้าเว็บ (UiLanguage) — internal: ชุดทดสอบบน emulator ตรวจภาษา */
    internal fun text(res: Int): String = UiLanguage.context(this, session.lang).getString(res)

    companion object {
        private const val TAG = "DocScanner"
        const val BRIDGE_NAME = "DocScannerBridge"
        private const val TRANSFER_DIR = "transfers"
        private const val CAMERA_DIR = "camera"
        private const val SHARE_DIR = "share"
        private const val MAX_INTENT_TEXT = 100_000

        /** ให้หน้าเว็บจัดการปุ่มย้อนกลับก่อน — คืน JSON {handled, view, dialog} (view/dialog ไว้บันทึก log) */
        private const val BACK_SCRIPT = "(function(){try{var d=document.querySelector('dialog[open]');" +
            "var v=history.state&&history.state.v;" +
            "var h=!!(window.AppPlatform&&AppPlatform.onBack&&AppPlatform.onBack());" +
            "return JSON.stringify({handled:h,view:v||null,dialog:d?d.id:null});}" +
            "catch(e){return JSON.stringify({handled:false,error:String(e)});}})()"
    }
}
