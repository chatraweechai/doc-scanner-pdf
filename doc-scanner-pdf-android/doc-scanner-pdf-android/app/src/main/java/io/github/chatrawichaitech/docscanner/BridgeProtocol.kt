package io.github.chatrawichaitech.docscanner

import org.json.JSONException
import org.json.JSONObject

/**
 * ข้อความระหว่างหน้าเว็บ (android/platform.js) กับแอป ผ่าน WebMessageListener "DocScannerBridge"
 *
 *   {v:1, op:"begin", id, kind:"save"|"share", name, mime, size, chunks}   เริ่มส่งไฟล์
 *   {v:1, op:"chunk", id, index, data:<base64>}                           ส่งทีละชิ้นตามลำดับ
 *   {v:1, op:"end", id}                                                   ส่งครบ → บันทึก/แชร์
 *   {v:1, op:"shareText", id, text, title}                                แชร์ข้อความ
 *   {v:1, op:"lang", id, lang:"th"|"en"}                                  ภาษาของหน้าเว็บ (ข้อความของแอปใช้ภาษาเดียวกัน)
 * แอปตอบ {id, ok:true, result:"saved"|"cancelled"|"shared"|"lang"} หรือ {id, ok:false, error}
 * ทุกค่าตรวจที่นี่ก่อนใช้ (ข้อความมาจากหน้าเว็บ ถือว่าไม่น่าเชื่อถือ)
 */
object BridgeProtocol {
    const val MAX_FILE_BYTES = 256L * 1024 * 1024
    const val MAX_CHUNKS = 65_536
    const val MAX_CHUNK_CHARS = 1_048_576
    const val MAX_TEXT_CHARS = 2_000_000
    const val MAX_MESSAGE_CHARS = 4_200_000
    private val ID = Regex("^[A-Za-z0-9_-]{1,64}$")

    /** ภาษาของหน้าจอที่แอปมีข้อความให้ (res/values = en, res/values-th = th) */
    val LANGS = setOf("th", "en")

    enum class Kind { SAVE, SHARE }

    sealed class Message {
        abstract val id: String

        data class Begin(
            override val id: String,
            val kind: Kind,
            val name: String,
            val mime: String,
            val size: Long,
            val chunks: Int,
        ) : Message()

        data class Chunk(override val id: String, val index: Int, val data: String) : Message()
        data class End(override val id: String) : Message()
        data class ShareText(override val id: String, val text: String, val title: String) : Message()
        data class Lang(override val id: String, val lang: String) : Message()
    }

    /** ข้อความผิดรูปแบบ — id = null ถ้าอ่าน id ไม่ได้ (ตอบกลับไม่ได้) */
    class ProtocolException(message: String, val id: String?) : Exception(message)

    fun parse(raw: String?): Message {
        if (raw == null || raw.length > MAX_MESSAGE_CHARS) throw ProtocolException("ข้อความยาวเกินไป", null)
        val o = try {
            JSONObject(raw)
        } catch (e: JSONException) {
            throw ProtocolException("รูปแบบข้อความไม่ถูกต้อง", null)
        }
        val idValue = o.opt("id")
        val id = if (idValue is String && ID.matches(idValue)) idValue else throw ProtocolException("รหัสคำขอไม่ถูกต้อง", null)
        fun bad(what: String): Nothing = throw ProtocolException("ข้อมูลไม่ถูกต้อง: $what", id)
        if (intOf(o, "v") != 1L) bad("v")
        return when (stringOf(o, "op")) {
            "begin" -> {
                val kind = when (stringOf(o, "kind")) {
                    "save" -> Kind.SAVE
                    "share" -> Kind.SHARE
                    else -> bad("kind")
                }
                val mime = stringOf(o, "mime")
                if (mime == null || mime !in FileNames.EXTENSIONS) bad("mime")
                val size = intOf(o, "size") ?: bad("size")
                if (size < 0 || size > MAX_FILE_BYTES) bad("size")
                val chunks = intOf(o, "chunks") ?: bad("chunks")
                if (chunks < 1 || chunks > MAX_CHUNKS || chunks > maxOf(1L, size)) bad("chunks")
                val name = stringOf(o, "name") ?: bad("name")
                if (name.length > 1000) bad("name")
                Message.Begin(id, kind, name, mime, size, chunks.toInt())
            }
            "chunk" -> {
                val index = intOf(o, "index") ?: bad("index")
                if (index < 0 || index >= MAX_CHUNKS) bad("index")
                val data = stringOf(o, "data") ?: bad("data")
                if (data.length > MAX_CHUNK_CHARS) bad("data")
                Message.Chunk(id, index.toInt(), data)
            }
            "end" -> Message.End(id)
            "shareText" -> {
                val text = stringOf(o, "text") ?: bad("text")
                if (text.isEmpty() || text.length > MAX_TEXT_CHARS) bad("text")
                val title = stringOf(o, "title") ?: ""
                if (title.length > 1000) bad("title")
                Message.ShareText(id, text, title)
            }
            "lang" -> {
                val lang = stringOf(o, "lang")
                if (lang == null || lang !in LANGS) bad("lang")
                Message.Lang(id, lang)
            }
            else -> bad("op")
        }
    }

    fun ok(id: String, result: String): String =
        JSONObject().put("id", id).put("ok", true).put("result", result).toString()

    fun error(id: String, message: String): String =
        JSONObject().put("id", id).put("ok", false).put("error", message).toString()

    private fun stringOf(o: JSONObject, key: String): String? = o.opt(key) as? String

    /** จำนวนเต็มเท่านั้น (ไม่รับทศนิยม/ข้อความ) */
    private fun intOf(o: JSONObject, key: String): Long? = when (val v = o.opt(key)) {
        is Int -> v.toLong()
        is Long -> v
        else -> null
    }
}
