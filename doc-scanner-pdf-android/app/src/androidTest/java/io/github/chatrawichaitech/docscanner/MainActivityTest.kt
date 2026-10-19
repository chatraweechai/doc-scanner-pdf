package io.github.chatrawichaitech.docscanner

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.Context
import android.util.Log
import android.app.Instrumentation.ActivityResult
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.espresso.intent.matcher.IntentMatchers.isInternal
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import androidx.test.uiautomator.By
import androidx.test.uiautomator.StaleObjectException
import androidx.test.uiautomator.UiDevice
import org.hamcrest.Matchers.not
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileOutputStream
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.zip.ZipInputStream
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

/**
 * แอปจริงบน Android emulator (มือถือและแท็บเล็ตใน CI): หน้าเว็บจาก assets, OpenCV/OCR, เลือกรูปผ่านหน้าต่างของระบบ,
 * แปลงไฟล์ PDF เป็น Word/JPG,
 * กล้องในแอปและกล้องของเครื่อง, บันทึก/แชร์ PDF ผ่านหน้าต่างของระบบ, ปุ่มย้อนกลับ, หมุนจอ, การจัดวางตามขนาดจอ
 * หน้าต่างของระบบ (เลือกไฟล์ บันทึก แชร์ กล้อง) ถูกแทนด้วย Espresso-Intents — ส่วนอื่นเป็นของจริงทั้งหมด
 */
@RunWith(AndroidJUnit4::class)
@LargeTest
class MainActivityTest {
    private companion object {
        const val APP_ID = "io.github.chatrawichaitech.docscanner"
        /** ผลของหน้าต่างที่บอกว่ายังไม่ได้บันทึกไฟล์ (ภาษาไทยหรืออังกฤษตามภาษาของเครื่อง) */
        val NOT_SAVED = Regex("ยังไม่ได้บันทึก|isn’t saved yet")
    }

    @get:Rule
    val cameraPermission: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.CAMERA)

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val device = UiDevice.getInstance(instrumentation)
    private var scenario: ActivityScenario<MainActivity>? = null
    /** context ของแอป (จาก Activity จริง — FileProvider และ cache เป็นของแอป) */
    private lateinit var context: Context
    private lateinit var testDir: File

    private fun scenario(): ActivityScenario<MainActivity> = scenario!!

    @Before
    fun setUp() {
        Log.i("DocScannerTest", "API ${Build.VERSION.SDK_INT}, target ${instrumentation.targetContext.packageName}, process ${Application.getProcessName()}")
        device.setOrientationNatural()
        // จอเปิดอยู่ ไม่มีหน้าล็อก/แถบแจ้งเตือนบังแอป (การแตะของ UiDevice ไปที่หน้าต่างบนสุดเสมอ)
        device.wakeUp()
        shell("wm dismiss-keyguard")
        shell("cmd statusbar collapse")
        // หน้าต่าง "แอปไม่ตอบสนอง" ของแอปอื่นบน emulator (เช่น Google Play services) บังจอและแย่งโฟกัส
        shell("settings put global hide_error_dialogs 1")
        Intents.init()
        // หน้าต่างของแอปอื่นทั้งหมด: ยกเลิกไว้ก่อน (แต่ละการทดสอบกำหนดผลเองตามที่ต้องการ)
        intending(not(isInternal())).respondWith(ActivityResult(Activity.RESULT_CANCELED, null))
        // เปิดด้วย component ของแอปโดยตรง (ไม่อาศัยชื่อแพ็กเกจจาก targetContext)
        val launch = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setClassName(APP_ID, "$APP_ID.MainActivity")
        val pm = instrumentation.targetContext.packageManager
        Log.i("DocScannerTest", "resolve: " + launch.resolveActivityInfo(pm, 0) + " / query: " +
            pm.queryIntentActivities(launch, 0).map { it.activityInfo.name } + " / activities: " +
            runCatching { pm.getPackageInfo(APP_ID, PackageManager.GET_ACTIVITIES).activities?.map { it.name } }.getOrElse { it.toString() })
        scenario = ActivityScenario.launch(launch)
        scenario().onActivity { context = it.applicationContext }
        testDir = File(context.cacheDir, "share/androidTest").apply { mkdirs() }
        waitJs("document.getElementById('cvStatus') && document.getElementById('cvStatus').dataset.state === 'ready'", 180_000)
    }

    @After
    fun tearDown() {
        Intents.release()
        scenario?.close()
        device.unfreezeRotation()
        if (::testDir.isInitialized) testDir.deleteRecursively()
    }

    // ---------------------------------------------------------------- helpers

    /** รัน JavaScript ในหน้าเว็บ คืนค่าที่แปลงจาก JSON แล้ว */
    private fun js(script: String): Any? {
        val latch = CountDownLatch(1)
        var result = "null"
        scenario().onActivity { a -> a.webView.evaluateJavascript(script) { r -> result = r ?: "null"; latch.countDown() } }
        assertTrue("JavaScript timed out: $script", latch.await(60, TimeUnit.SECONDS))
        return JSONTokener(result).nextValue()
    }

    private fun jsString(script: String): String = js(script)?.toString() ?: ""

    private fun waitJs(condition: String, timeoutMs: Long = 60_000, detail: (() -> String)? = null) {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) {
            if (js("(function(){try{return !!($condition);}catch(e){return false;}})()") == true) return
            Thread.sleep(250)
        }
        throw AssertionError("timed out waiting for: $condition" + (detail?.let { " — " + it() } ?: "") +
            " — page: " + jsString("document.body.innerText.slice(0, 300)"))
    }

    /** คำสั่ง shell ของอุปกรณ์ (สิทธิ์ของ UiAutomation) คืนข้อความที่พิมพ์ออกมา */
    private fun shell(command: String): String =
        ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand(command)).use {
            it.readBytes().toString(Charsets.UTF_8)
        }

    /** หน้าต่างที่รับการแตะอยู่ตอนนี้ (สำหรับข้อความเมื่อทดสอบล้ม) */
    private fun focusInfo(): String = shell("dumpsys window").lineSequence()
        .filter { Regex("mCurrentFocus|mFocusedApp|mFocusedWindow|isKeyguardShowing|mShowingDream|mDreamingLockscreen").containsMatchIn(it) }
        .map { it.trim() }.distinct().take(8).joinToString(" | ")

    /** รอจนหน้าต่างของแอปรับการแตะ/ปุ่มได้ (ไม่มีหน้าต่างอื่นบังอยู่) */
    private fun waitWindowFocus(what: String) {
        val end = System.currentTimeMillis() + 30_000
        var focused = false
        while (!focused && System.currentTimeMillis() < end) {
            scenario().onActivity { focused = it.hasWindowFocus() }
            if (!focused) {
                dismissOtherAppErrorDialog()
                Thread.sleep(250)
            }
        }
        assertTrue("app window has no focus before $what — ${focusInfo()}", focused)
    }

    /**
     * หน้าต่าง "แอปไม่ตอบสนอง/หยุดทำงาน" ของแอปอื่นบน emulator (เช่น com.google.android.gms) — กด "รอ"/"ปิด" แบบผู้ใช้
     * (ถ้าเป็นหน้าต่างของแอปนี้เอง การทดสอบต้องล้ม ไม่ปิดให้)
     */
    private fun dismissOtherAppErrorDialog() {
        try {
            val title = device.findObject(By.res("android", "alertTitle"))?.text ?: return
            if (title.contains(context.getString(R.string.app_name))) return
            val button = device.findObject(By.res("android", "aerr_wait")) ?: device.findObject(By.res("android", "aerr_close")) ?: return
            Log.w("DocScannerTest", "dismissing another app's error dialog: $title")
            button.click()
        } catch (e: StaleObjectException) {
            // หน้าต่างปิดไปเองระหว่างอ่าน — ไม่ต้องทำอะไร
        }
    }

    /**
     * แตะปุ่มจริงบนจอ (การแตะของผู้ใช้จริง เช่น เปิดหน้าต่างเลือกไฟล์ได้เฉพาะเมื่อผู้ใช้แตะ) และยืนยันว่าปุ่มได้รับ click
     * emulator ที่เพิ่งบูตทำงานช้าจนบางครั้งการแตะไม่กลายเป็น click (เช่น กลายเป็นกดค้าง) — แตะซ้ำได้สูงสุด 3 ครั้ง
     * และบันทึกเหตุการณ์ที่หน้าเว็บได้รับไว้ใน log
     */
    private fun tap(selector: String) {
        waitWindowFocus("tapping $selector")
        var where = ""
        var events = ""
        for (attempt in 1..3) {
            val r = JSONObject(jsString("(function(){var sel='$selector';window.__tapSel=sel;window.__tap=[];" +
                "if(!window.__tapHook){window.__tapHook=true;['pointerdown','pointerup','pointercancel','contextmenu','click'].forEach(function(type){" +
                "document.addEventListener(type,function(ev){if(window.__tap)window.__tap.push(type+(ev.target.closest&&ev.target.closest(window.__tapSel)?'':':other'));},{capture:true});});}" +
                "var e=document.querySelector(sel);e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();" +
                "return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,w:innerWidth});})()"))
            instrumentation.waitForIdleSync()
            var x = 0
            var y = 0
            scenario().onActivity { a ->
                val loc = IntArray(2)
                a.webView.getLocationOnScreen(loc)
                // พิกเซลจอต่อ 1 CSS px วัดจากขนาดจริงของ WebView (ไม่ขึ้นกับ density/zoom)
                val scale = a.webView.width.toDouble() / r.getDouble("w")
                x = loc[0] + (r.getDouble("x") * scale).roundToInt()
                y = loc[1] + (r.getDouble("y") * scale).roundToInt()
                where = "at $x,$y, webView at ${loc[0]},${loc[1]} ${a.webView.width}x${a.webView.height}, scale $scale"
            }
            assertTrue("tap $selector ($where)", device.click(x, y))
            val end = System.currentTimeMillis() + 10_000
            while (System.currentTimeMillis() < end) {
                events = jsString("JSON.stringify(window.__tap)")
                if (JSONArray(events).let { a -> (0 until a.length()).any { a.getString(it) == "click" } }) return
                Thread.sleep(200)
            }
            Log.w("DocScannerTest", "tap $selector attempt $attempt: no click ($where, events $events) — ${focusInfo()}")
            waitWindowFocus("tapping $selector again")
        }
        throw AssertionError("tap $selector: no click after 3 taps ($where, events $events) — ${focusInfo()}")
    }

    private fun click(selector: String) = js("document.querySelector('$selector').click()")

    private fun pageCount(): Int = (js("document.querySelectorAll('.page-item').length") as Number).toInt()

    private fun waitIdle() = waitJs("[...document.querySelectorAll('.page-state')].every(function(e){return e.hidden})", 120_000)

    /** เปิดหน้าต่างของหน้าเว็บแล้วแป้นพิมพ์บนจอต้องไม่เด้งขึ้นมา (โฟกัสอยู่ที่หัวข้อ ไม่ใช่ช่องพิมพ์) */
    private fun assertNoKeyboard(titleId: String) {
        assertEquals("focus when the dialog opens", titleId, jsString("document.activeElement && document.activeElement.id"))
        Thread.sleep(1500) // แป้นพิมพ์ใช้เวลาเลื่อนขึ้น
        var ime: Boolean? = null
        scenario().onActivity { a -> ime = ViewCompat.getRootWindowInsets(a.webView)?.isVisible(WindowInsetsCompat.Type.ime()) }
        assertTrue("on-screen keyboard is showing — ${focusInfo()}", ime != true)
    }

    private fun uriFor(file: File): Uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)

    /** ภาพถ่ายเอกสารจำลอง: กระดาษขาวเอียงบนโต๊ะสีเข้ม มีข้อความภาษาอังกฤษ/ไทย */
    private fun documentPhoto(name: String): File {
        val bmp = Bitmap.createBitmap(1200, 1600, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.rgb(62, 48, 36))
        val paper = Path().apply {
            moveTo(210f, 170f); lineTo(1010f, 230f); lineTo(970f, 1430f); lineTo(170f, 1380f); close()
        }
        c.drawPath(paper, Paint().apply { color = Color.WHITE; isAntiAlias = true })
        val text = Paint().apply { color = Color.BLACK; textSize = 64f; isAntiAlias = true; typeface = Typeface.DEFAULT_BOLD }
        c.save()
        c.rotate(3.5f, 600f, 800f)
        listOf("INVOICE 2026", "TOTAL 13375 BAHT", "ใบแจ้งหนี้", "THANK YOU").forEachIndexed { i, s -> c.drawText(s, 300f, 420f + i * 170f, text) }
        c.restore()
        val f = File(testDir, name)
        FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it) }
        bmp.recycle()
        return f
    }

    /** เลือกรูปผ่านปุ่ม "เลือกรูปภาพ" → หน้าต่างเลือกไฟล์ของระบบ (ตอบด้วยไฟล์ที่เตรียมไว้) */
    private fun pickImages(count: Int) = pickFiles((1..count).map { documentPhoto("page-$it.jpg") })

    /** ไฟล์จาก assets ของชุดทดสอบ (เช่น รูป HEIC จาก iPhone) คัดลอกไปที่แชร์ให้หน้าต่างเลือกไฟล์ได้ */
    private fun testAsset(name: String): File = File(testDir, name).also { f ->
        instrumentation.context.assets.open(name).use { input -> FileOutputStream(f).use { input.copyTo(it) } }
    }

    private fun pickFiles(files: List<File>) {
        val count = files.size
        val uris = files.map { uriFor(it) }
        val data = Intent().setData(uris[0])
        if (uris.size > 1) {
            val clip = ClipData.newRawUri("images", uris[0])
            uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
            data.clipData = clip
        }
        val before = pageCount()
        val sent = Intents.getIntents().count { it.action == Intent.ACTION_GET_CONTENT }
        intending(hasAction(Intent.ACTION_GET_CONTENT)).respondWith(ActivityResult(Activity.RESULT_OK, data))
        tap("#btnPick")
        // การแตะต้องเปิดหน้าต่างเลือกไฟล์ของระบบ แล้วรูปที่ได้กลับมาต้องกลายเป็นหน้าเอกสาร
        val end = System.currentTimeMillis() + 15_000
        while (Intents.getIntents().count { it.action == Intent.ACTION_GET_CONTENT } == sent) {
            assertTrue("tapping #btnPick did not open the system file picker — ${focusInfo()}", System.currentTimeMillis() < end)
            Thread.sleep(200)
        }
        waitJs("document.querySelectorAll('.page-item').length === ${before + count}", 120_000) {
            "messages: " + jsString("document.getElementById('toasts').innerText") + " — ${focusInfo()}"
        }
        waitIdle()
    }

    private fun screenshot(name: String) {
        val dir = InstrumentationRegistry.getArguments().getString("additionalTestOutputDir")?.let { File(it) }
            ?: context.getExternalFilesDir("screenshots") ?: return
        dir.mkdirs()
        val bmp = instrumentation.uiAutomation.takeScreenshot() ?: return
        val cfg = context.resources.configuration
        FileOutputStream(File(dir, "${Build.MODEL.replace(Regex("\\W+"), "_")}-sw${cfg.smallestScreenWidthDp}-$name.png")).use {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
    }

    // ---------------------------------------------------------------- tests

    @Test
    fun loadsFromTheAppOffline() {
        val info = JSONObject(jsString("JSON.stringify({origin: location.origin, secure: isSecureContext, id: AppPlatform.id," +
            " bridge: typeof DocScannerBridge, cv: CvEngine.info(), version: document.getElementById('appVersion').textContent})"))
        assertEquals("https://appassets.androidplatform.net", info.getString("origin"))
        assertTrue(info.getBoolean("secure"))
        assertEquals("android", info.getString("id"))
        assertEquals("object", info.getString("bridge"))
        // ภาษาของหน้าเว็บตามภาษาของเครื่อง (emulator ใน CI เป็นภาษาอังกฤษ) — ยังไม่เคยกดปุ่มเปลี่ยนภาษา
        val lang = jsString("I18n.lang")
        assertEquals(if (Locale.getDefault().language == "th") "th" else "en", lang)
        // เลขรุ่นของแอป (CHANGELOG.md → versionName) ไม่ใช่เลข commit และไม่มีเวลาที่เปิด
        val version = (if (lang == "th") "เวอร์ชัน" else "Version") + " v${BuildConfig.VERSION_NAME} (Android)"
        assertEquals(info.toString(), version, info.getString("version"))
        // OpenCV ทำงานใน Web Worker (คำขอไฟล์ของ Worker ผ่าน AssetRouter ได้)
        assertEquals(info.toString(), "worker", info.getJSONObject("cv").getString("mode"))
        // แอปไม่มีสิทธิ์อินเทอร์เน็ต และปิดกั้นทุกโดเมนนอกแอป
        js("window.__net = 'pending'; fetch('https://example.com/').then(function(r){window.__net='status ' + r.status}, function(){window.__net='blocked'})")
        waitJs("window.__net !== 'pending'")
        assertTrue(jsString("window.__net"), jsString("window.__net").let { it == "blocked" || it == "status 403" })
        screenshot("home-empty")
    }

    @Test
    fun importExportSaveShareAndOcr() {
        pickImages(2)
        // บันทึก PDF → หน้าต่าง "บันทึกเป็น" ของระบบ (ตอบด้วยไฟล์ในแอป)
        val saved = File(testDir, "saved.pdf").apply { writeBytes(ByteArray(0)) }
        intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(ActivityResult(Activity.RESULT_OK, Intent().setData(uriFor(saved))))
        click("#btnExport")
        waitJs("document.getElementById('exportDialog').open")
        screenshot("export")
        click("#exDownload")
        waitJs("!document.getElementById('exResult').hidden", 180_000)
        val result = jsString("document.getElementById('exResult').textContent")
        assertTrue(result, Regex("^(สร้าง|Created) \"").containsMatchIn(result) && !NOT_SAVED.containsMatchIn(result))
        val pdf = saved.readBytes()
        assertEquals(result, "%PDF-", String(pdf, 0, 5, Charsets.ISO_8859_1))
        assertEquals(2, Regex("/Type\\s*/Page[^s]").findAll(String(pdf, Charsets.ISO_8859_1)).count())
        val createIntent = Intents.getIntents().last { it.action == Intent.ACTION_CREATE_DOCUMENT }
        assertEquals("application/pdf", createIntent.type)
        assertTrue(createIntent.getStringExtra(Intent.EXTRA_TITLE)!!.endsWith(".pdf"))

        // ยกเลิกหน้าต่างบันทึก → แจ้งว่ายังไม่ได้บันทึก
        intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(ActivityResult(Activity.RESULT_CANCELED, null))
        click("#exDownload")
        waitJs("/ยังไม่ได้บันทึก|isn’t saved yet/.test(document.getElementById('exResult').textContent)", 180_000)

        // แชร์ → หน้าต่างแชร์ของระบบพร้อมไฟล์ PDF ที่อ่านได้
        intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(ActivityResult(Activity.RESULT_OK, null))
        assertTrue(js("!document.getElementById('exShare').hidden") == true)
        click("#exShare")
        val chooser = waitForIntent(Intent.ACTION_CHOOSER)
        @Suppress("DEPRECATION")
        val send = chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertEquals(Intent.ACTION_SEND, send.action)
        assertEquals("application/pdf", send.type)
        assertTrue(send.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        @Suppress("DEPRECATION")
        val stream = send.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)!!
        val shared = context.contentResolver.openInputStream(stream)!!.use { it.readBytes() }
        assertEquals("%PDF-", String(shared, 0, 5, Charsets.ISO_8859_1))
        click("#exCancel")

        // OCR จากไฟล์ในแอป (ไม่ใช้อินเทอร์เน็ต)
        click(".page-item .page-card")
        waitJs("!document.getElementById('viewEditor').hidden")
        click("#edOcr")
        waitJs("document.getElementById('ocrDialog').open")
        assertNoKeyboard("ocrTitle")
        waitJs("document.getElementById('ocrDialog').open && document.getElementById('ocrProgressWrap').hidden", 240_000)
        val text = jsString("document.getElementById('ocrText').value")
        assertTrue("OCR text: $text", text.uppercase().contains("INVOICE"))
        screenshot("ocr")
        // แชร์ข้อความ
        click("#ocrShare")
        val textChooser = waitForIntent(Intent.ACTION_CHOOSER, after = chooser)
        @Suppress("DEPRECATION")
        val sendText = textChooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertEquals("text/plain", sendText.type)
        assertEquals(text, sendText.getStringExtra(Intent.EXTRA_TEXT))
    }

    /**
     * สถานะของ activity — null ระหว่างที่ระบบกำลังเปลี่ยนสถานะ (ActivityScenario.getState โยน NullPointerException
     * "the transition is incomplete" เมื่อถามกลางการเปลี่ยน เช่น ตอนกดย้อนกลับแล้วแอปกำลังไปเบื้องหลัง) — ถามใหม่ภายหลัง
     */
    private fun currentState(): Lifecycle.State? = try {
        scenario().state
    } catch (e: NullPointerException) {
        null
    }

    private fun waitState(state: Lifecycle.State, timeoutMs: Long = 15_000, detail: (() -> String)? = null) {
        val end = System.currentTimeMillis() + timeoutMs
        var now = currentState()
        while (now != state) {
            assertTrue("activity state ${now ?: "(changing)"}, expected $state" + (detail?.let { " — " + it() } ?: ""),
                System.currentTimeMillis() < end)
            Thread.sleep(200)
            now = currentState()
        }
    }

    private fun waitForIntent(action: String, after: Intent? = null, timeoutMs: Long = 30_000): Intent {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) {
            val found = Intents.getIntents().lastOrNull { it.action == action && it !== after }
            if (found != null) return found
            Thread.sleep(200)
        }
        throw AssertionError("no $action intent")
    }

    @Test
    fun inAppCameraTakesPages() {
        tap("#btnCamera")
        waitJs("!document.getElementById('viewCamera').hidden")
        // กล้องของ emulator ส่งภาพเข้ามา → ปุ่มถ่ายใช้ได้
        waitJs("!document.getElementById('camShutter').disabled || !document.getElementById('camBlocked').hidden", 60_000)
        assertTrue("camera panel: " + jsString("document.getElementById('camBlocked').innerText"),
            js("document.getElementById('camBlocked').hidden") == true)
        screenshot("camera")
        click("#camShutter")
        waitJs("document.getElementById('camCount').textContent === '1'", 30_000)
        device.pressBack()
        waitJs("document.getElementById('viewCamera').hidden")
        assertEquals(1, pageCount())
    }

    @Test
    fun deviceCameraAddsThePhoto() {
        val photo = documentPhoto("capture-source.jpg").readBytes()
        intending(hasAction(MediaStore.ACTION_IMAGE_CAPTURE)).respondWithFunction { intent ->
            @Suppress("DEPRECATION")
            val out = intent.getParcelableExtra<Uri>(MediaStore.EXTRA_OUTPUT)
            context.contentResolver.openOutputStream(out!!)!!.use { it.write(photo) }
            ActivityResult(Activity.RESULT_OK, null)
        }
        tap("#btnNativeCamera")
        waitJs("document.querySelectorAll('.page-item').length === 1")
        waitIdle()
    }

    @Test
    fun backButtonClosesDialogsThenViewsThenLeavesWithoutLosingPages() {
        pickImages(1)
        click(".page-item .page-card")
        waitJs("!document.getElementById('viewEditor').hidden")
        click("#edCrop")
        waitJs("!document.getElementById('viewCrop').hidden")
        device.pressBack()
        waitJs("document.getElementById('viewCrop').hidden && !document.getElementById('viewEditor').hidden")
        device.pressBack()
        waitJs("document.getElementById('viewEditor').hidden")
        click("#btnExport")
        waitJs("document.getElementById('exportDialog').open")
        assertNoKeyboard("exportTitle")
        device.pressBack()
        waitJs("!document.getElementById('exportDialog').open")
        // หน้าหลัก: ย้อนกลับ = ย้ายแอปไปเบื้องหลัง (ไม่ปิด) — เปิดกลับมาแล้วเป็นหน้าเดิม หน้าที่สแกนไว้ยังอยู่
        Log.i("DocScannerTest", "before the last back: " + jsString("JSON.stringify({state: history.state, dialogs: " +
            "[...document.querySelectorAll('dialog[open]')].map(function(d){return d.id}), active: document.activeElement && document.activeElement.id})"))
        waitWindowFocus("the last back")
        Log.i("DocScannerTest", "focus before the last back: ${focusInfo()}")
        var before: MainActivity? = null
        scenario().onActivity { before = it }
        val pressed = device.pressBack()
        waitState(Lifecycle.State.CREATED) { "pressBack=$pressed, page: " + jsString("JSON.stringify({state: history.state, " +
            "dialogs: [...document.querySelectorAll('dialog[open]')].length})") + " — ${focusInfo()}" }
        scenario().onActivity { assertTrue("must not finish", !it.isFinishing) }
        context.startActivity(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
        waitState(Lifecycle.State.RESUMED)
        scenario().onActivity { assertSame(before, it) }
        assertEquals(1, pageCount())
    }

    /** ข้อความของแอป (strings.xml) ในภาษาที่แอปใช้อยู่ตอนนี้ (MainActivity.text) */
    private fun appText(res: Int): String {
        var out = ""
        scenario().onActivity { out = it.text(res) }
        return out
    }

    private fun savedLanguage(): String? = context.getSharedPreferences("ui", Context.MODE_PRIVATE).getString("lang", null)

    private fun waitUntil(what: String, timeoutMs: Long = 15_000, ok: () -> Boolean) {
        val end = System.currentTimeMillis() + timeoutMs
        while (!ok()) {
            assertTrue("timed out waiting for: $what", System.currentTimeMillis() < end)
            Thread.sleep(200)
        }
    }

    @Test
    fun languageButtonSwitchesTheAppToo() {
        // หน้าเว็บบอกภาษาให้แอป → ข้อความของแอป (Toast, ข้อผิดพลาดบันทึก/แชร์) ภาษาเดียวกัน และจำไว้ใช้ครั้งต่อไป
        val start = jsString("I18n.lang")
        val other = if (start == "th") "en" else "th"
        val ok = mapOf("th" to "ตกลง", "en" to "OK")
        try {
            waitUntil("the page tells the app its language ($start)") { savedLanguage() == start && appText(R.string.ok) == ok[start] }
            tap("#btnLang")
            waitJs("I18n.lang === '$other' && document.documentElement.lang === '$other'")
            waitUntil("app texts follow the page ($other)") { savedLanguage() == other && appText(R.string.ok) == ok[other] }
            screenshot("language-$other")
            // หน้าภาษาอังกฤษไม่มีข้อความไทยเหลือ (ยกเว้นปุ่มที่เปลี่ยนกลับเป็นภาษาไทย)
            if (other == "th") {
                tap("#btnLang")
                waitJs("I18n.lang === 'en'")
                waitUntil("app texts back in English") { appText(R.string.ok) == "OK" }
            }
            val thai = jsString("""(function(){var TH=/[\u0E00-\u0E7F]/,b=[];var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);""" +
                """for(var n=w.nextNode();n;n=w.nextNode()){if(!n.parentElement.closest('#btnLang,script,style,noscript')&&TH.test(n.nodeValue))b.push(n.nodeValue.trim())}""" +
                """return b.join(' | ')})()""")
            assertEquals("Thai text left in the English page", "", thai)
        } finally {
            js("localStorage.removeItem('lang')")
            context.getSharedPreferences("ui", Context.MODE_PRIVATE).edit().clear().commit()
        }
    }

    @Test
    fun heicPhotoOpens() {
        // รูป HEIC (iPhone/มือถือหลายรุ่น): WebView ถอดรหัสเองไม่ได้ → libheif ใน Web Worker ของหน้าเว็บ
        pickFiles(listOf(testAsset("photo-tilted.heic")))
        val info = JSONObject(jsString("JSON.stringify(HeicDecoder.info())"))
        assertEquals(info.toString(), "worker", info.getString("mode"))
        assertEquals(1, info.getInt("decoded"))
        assertEquals(1, pageCount())
        screenshot("heic")
    }

    @Test
    fun pdfToWordAndJpeg() {
        // แปลงไฟล์ PDF (PDF.js legacy build ต้องทำงานบน WebView ทุกรุ่นใน CI รวมถึงแท็บเล็ตที่ยังเป็น WebView 124)
        // thai.pdf สร้างด้วย Chrome + ฟอนต์ Sarabun: วรรณยุกต์ที่ลดระดับไม่มีรหัส Unicode ข้อความจริงอยู่ใน /ActualText
        val expected = listOf(
            "การประชุมคณะกรรมการ ครั้งที่ ๑/๒๕๖๙",
            "น้ำ ที่ กำลัง ผู้ใหญ่ ปฏิบัติ ฤๅษี ฦๅ ญาติ ฐาน กฎหมาย",
            "คำสั่ง ปั้น กั๊ก ซ้ำ ต่ำ ล้ำ ปู่ ฤทธิ์ พระราชบัญญัติ English 2026",
        ).joinToString("\n")
        val pdf = testAsset("thai.pdf")
        val sent = Intents.getIntents().count { it.action == Intent.ACTION_GET_CONTENT }
        intending(hasAction(Intent.ACTION_GET_CONTENT)).respondWith(ActivityResult(Activity.RESULT_OK, Intent().setData(uriFor(pdf))))
        tap("#btnPdfTools")
        val end = System.currentTimeMillis() + 15_000
        while (Intents.getIntents().count { it.action == Intent.ACTION_GET_CONTENT } == sent) {
            assertTrue("tapping #btnPdfTools did not open the system file picker — ${focusInfo()}", System.currentTimeMillis() < end)
            Thread.sleep(200)
        }
        // หน้าต่างเลือกไฟล์ของระบบเปิดสำหรับ PDF เท่านั้น
        assertEquals("application/pdf", Intents.getIntents().last { it.action == Intent.ACTION_GET_CONTENT }.type)
        waitJs("document.getElementById('pdfDialog').open && !document.getElementById('pdfConvert').disabled", 120_000) {
            jsString("document.getElementById('pdfResult').textContent")
        }
        assertTrue(jsString("document.getElementById('pdfFileInfo').textContent").let { it.contains("1 หน้า") || it.contains("1 page,") })
        screenshot("pdf-convert")

        // Word → หน้าต่าง "บันทึกเป็น" ของระบบสำหรับ .docx
        val word = File(testDir, "saved.docx").apply { writeBytes(ByteArray(0)) }
        intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(ActivityResult(Activity.RESULT_OK, Intent().setData(uriFor(word))))
        click("#pdfFormats .chip[data-format=\"docx\"]")
        click("#pdfConvert")
        waitJs("!document.getElementById('pdfResult').hidden && document.getElementById('pdfProgressWrap').hidden", 180_000)
        val result = jsString("document.getElementById('pdfResult').textContent")
        assertTrue(result, Regex("^(สร้าง|Created) \"").containsMatchIn(result) &&
            (result.contains("ตรงตามต้นฉบับ") || result.contains("exactly as in the PDF")) && !NOT_SAVED.containsMatchIn(result))
        val create = Intents.getIntents().last { it.action == Intent.ACTION_CREATE_DOCUMENT }
        assertEquals(FileNames.DOCX, create.type)
        assertEquals("thai.docx", create.getStringExtra(Intent.EXTRA_TITLE))
        assertEquals(expected, docxText(word.readBytes()))

        // JPG (High 300 dpi) → .jpg ขนาด A4 ที่ 300 dpi
        val jpg = File(testDir, "saved.jpg").apply { writeBytes(ByteArray(0)) }
        intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(ActivityResult(Activity.RESULT_OK, Intent().setData(uriFor(jpg))))
        click("#pdfFormats .chip[data-format=\"jpg\"]")
        js("(function(){var s=document.getElementById('pdfQuality');s.value='high';s.dispatchEvent(new Event('change'));})()")
        click("#pdfConvert")
        waitJs("!document.getElementById('pdfResult').hidden && document.getElementById('pdfProgressWrap').hidden", 180_000)
        assertEquals("image/jpeg", Intents.getIntents().last { it.action == Intent.ACTION_CREATE_DOCUMENT }.type)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(jpg.path, bounds)
        assertEquals(jsString("document.getElementById('pdfResult').textContent"), 2482, bounds.outWidth)
        assertEquals(3512, bounds.outHeight)
    }

    /** ข้อความใน word/document.xml ของไฟล์ .docx (บรรทัดและย่อหน้าคั่นด้วย \n) */
    private fun docxText(bytes: ByteArray): String {
        var xml = ""
        ZipInputStream(bytes.inputStream()).use { zip ->
            while (true) {
                val e = zip.nextEntry ?: break
                if (e.name == "word/document.xml") xml = zip.readBytes().toString(Charsets.UTF_8)
            }
        }
        assertTrue("document.xml missing", xml.isNotEmpty())
        return Regex("<w:p>(.*?)</w:p>").findAll(xml).map { it.groupValues[1] }
            .filter { !it.contains("w:type=\"page\"") }
            .joinToString("\n") { p ->
                p.replace("<w:br/>", "\n").replace("<w:tab/>", "\t").replace(Regex("<[^>]+>"), "")
                    .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&amp;", "&")
            }
    }

    @Test
    fun systemRecreationKeepsThePages() {
        pickImages(2)
        var before: MainActivity? = null
        var view: WebView? = null
        scenario().onActivity { before = it; view = it.webView }
        // ระบบสร้าง Activity ใหม่เอง (เช่น Android 12+ เปลี่ยนสีธีมตามวอลเปเปอร์) — แบบเดียวกับ recreate()
        scenario().recreate()
        var after: MainActivity? = null
        scenario().onActivity { after = it }
        assertNotSame("a new activity", before, after)
        scenario().onActivity { assertSame("the page (WebView) is kept", view, it.webView) }
        waitWindowFocus("after recreation")
        assertEquals(2, pageCount())
        // ยังใช้งานได้ตามปกติใน Activity ใหม่: เปิดหน้าแก้ไข แล้วปุ่มย้อนกลับพากลับหน้าหลัก
        click(".page-item .page-card")
        waitJs("!document.getElementById('viewEditor').hidden")
        device.pressBack()
        waitJs("document.getElementById('viewEditor').hidden")
        assertEquals(2, pageCount())
        screenshot("after-recreation")
    }

    @Test
    fun rotationKeepsTheSamePageAndWork() {
        pickImages(1)
        var before: MainActivity? = null
        scenario().onActivity { before = it }
        val landscape = context.resources.configuration.orientation != Configuration.ORIENTATION_LANDSCAPE
        if (landscape) device.setOrientationLandscape() else device.setOrientationPortrait()
        device.waitForIdle()
        Thread.sleep(1500)
        scenario().onActivity { assertSame("activity must not be recreated", before, it) }
        assertEquals(1, pageCount())
        checkLayout(if (landscape) "rotated-landscape" else "rotated-portrait")
    }

    @Test
    fun layoutFitsThisScreen() {
        pickImages(3)
        checkLayout("home")
        val cfg = context.resources.configuration
        val columns = (js("(function(){var y=[...document.querySelectorAll('.page-item')].map(function(e){return Math.round(e.getBoundingClientRect().top)});" +
            "return y.filter(function(v){return v===y[0]}).length})()") as Number).toInt()
        if (cfg.smallestScreenWidthDp >= 600) assertTrue("tablet shows $columns page(s) per row", columns >= 3)
        click(".page-item .page-card")
        waitJs("!document.getElementById('viewEditor').hidden")
        checkLayout("editor")
        click("#edCrop")
        waitJs("!document.getElementById('viewCrop').hidden")
        Thread.sleep(500)
        checkLayout("crop")
    }

    /** ไม่มีการเลื่อนด้านข้าง และปุ่มหลักอยู่ในจอ แตะได้ */
    private fun checkLayout(name: String) {
        val m = JSONObject(jsString("(function(){var d=document.documentElement,vw=d.clientWidth,vh=innerHeight,bad=[];" +
            "if(d.scrollWidth>vw+1)bad.push('sideways '+(d.scrollWidth-vw));" +
            "['#btnCamera','#btnPick','#btnExport','#edBack','#edCrop','#cropOk','#cropAuto'].forEach(function(s){var e=document.querySelector(s);" +
            "if(!e||e.offsetParent===null)return;var r=e.getBoundingClientRect();if(r.left<-1||r.right>vw+1||r.height<36)bad.push(s+' '+JSON.stringify(r));});" +
            "return JSON.stringify({vw:vw,vh:vh,bad:bad});})()"))
        screenshot(name)
        assertEquals("$name ${m.getInt("vw")}x${m.getInt("vh")}: ${m.getJSONArray("bad")}", 0, m.getJSONArray("bad").length())
    }

    @Test
    fun bridgeRejectsInvalidRequests() {
        js("window.__replies = []; DocScannerBridge.addEventListener('message', function(e){ window.__replies.push(e.data); });" +
            "DocScannerBridge.postMessage(JSON.stringify({v:1, op:'begin', id:'bad1', kind:'save', name:'x', mime:'text/html', size:1, chunks:1}));" +
            "DocScannerBridge.postMessage(JSON.stringify({v:1, op:'begin', id:'bad2', kind:'save', name:'x.pdf', mime:'application/pdf', size:1e12, chunks:1}));" +
            "DocScannerBridge.postMessage(JSON.stringify({v:1, op:'chunk', id:'bad3', index:0, data:'AAAA'}));" +
            "DocScannerBridge.postMessage('not json');")
        waitJs("window.__replies.length >= 3")
        Thread.sleep(500)
        val replies = (0 until (js("window.__replies.length") as Number).toInt()).map { JSONObject(jsString("window.__replies[$it]")) }
        assertEquals(replies.toString(), setOf("bad1", "bad2", "bad3"), replies.map { it.getString("id") }.toSet())
        assertTrue(replies.toString(), replies.all { !it.getBoolean("ok") })
        assertNotNull(jsString("AppPlatform.id"))
    }
}
