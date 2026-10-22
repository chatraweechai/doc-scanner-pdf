package io.github.chatrawichaitech.docscanner

import io.github.chatrawichaitech.docscanner.BridgeProtocol.Message
import io.github.chatrawichaitech.docscanner.BridgeProtocol.ProtocolException
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.Base64

/**
 * รับไฟล์จากหน้าเว็บทีละชิ้นลงไฟล์ชั่วคราว (ไม่เก็บทั้งไฟล์ในหน่วยความจำ)
 * ตรวจลำดับชิ้น ขนาดรวม และจำนวนไฟล์ที่ส่งพร้อมกัน — ผิดเมื่อไรยกเลิกและลบไฟล์ทันที
 */
class TransferStore(private val dir: File, private val maxActive: Int = 3) {

    class Transfer internal constructor(
        val id: String,
        val kind: BridgeProtocol.Kind,
        /** ชื่อที่ปลอดภัยแล้ว (FileNames.sanitize) */
        val name: String,
        val mime: String,
        val size: Long,
        val chunks: Int,
        val file: File,
    ) {
        internal var next = 0
        internal var written = 0L
        internal var out: FileOutputStream? = null
    }

    private val active = LinkedHashMap<String, Transfer>()

    @Synchronized
    fun activeCount(): Int = active.size

    @Synchronized
    fun begin(m: Message.Begin): Transfer {
        if (active.containsKey(m.id)) throw ProtocolException("รหัสคำขอซ้ำ", m.id)
        if (active.size >= maxActive) throw ProtocolException("มีไฟล์ที่กำลังส่งมากเกินไป", m.id)
        if (!dir.isDirectory && !dir.mkdirs()) throw IOException("สร้างโฟลเดอร์ชั่วคราวไม่ได้")
        val file = File.createTempFile("transfer-", ".part", dir)
        val t = Transfer(m.id, m.kind, FileNames.sanitize(m.name, m.mime), m.mime, m.size, m.chunks, file)
        try {
            t.out = FileOutputStream(file)
        } catch (e: IOException) {
            file.delete()
            throw e
        }
        active[m.id] = t
        return t
    }

    @Synchronized
    fun chunk(m: Message.Chunk) {
        val t = active[m.id] ?: throw ProtocolException("ไม่พบไฟล์ที่กำลังส่ง", m.id)
        if (m.index != t.next || m.index >= t.chunks) fail(t, "ลำดับชิ้นไฟล์ไม่ถูกต้อง")
        val bytes = try {
            Base64.getDecoder().decode(m.data)
        } catch (e: IllegalArgumentException) {
            fail(t, "ข้อมูลไฟล์เสีย")
        }
        if (t.written + bytes.size > t.size) fail(t, "ไฟล์ใหญ่กว่าที่แจ้งไว้")
        try {
            t.out!!.write(bytes)
        } catch (e: IOException) {
            discard(t)
            throw e
        }
        t.written += bytes.size
        t.next++
    }

    /** ส่งครบแล้ว — คืนไฟล์ที่สมบูรณ์ (ผู้เรียกต้องลบไฟล์เมื่อใช้เสร็จ) */
    @Synchronized
    fun end(m: Message.End): Transfer {
        val t = active[m.id] ?: throw ProtocolException("ไม่พบไฟล์ที่กำลังส่ง", m.id)
        if (t.next != t.chunks || t.written != t.size) fail(t, "ได้รับไฟล์ไม่ครบ")
        active.remove(m.id)
        try {
            t.out!!.close()
        } catch (e: IOException) {
            t.file.delete()
            throw e
        }
        t.out = null
        return t
    }

    @Synchronized
    fun abort(id: String) {
        active[id]?.let { discard(it) }
    }

    @Synchronized
    fun abortAll() {
        active.values.toList().forEach { discard(it) }
    }

    private fun fail(t: Transfer, message: String): Nothing {
        discard(t)
        throw ProtocolException(message, t.id)
    }

    private fun discard(t: Transfer) {
        active.remove(t.id)
        try {
            t.out?.close()
        } catch (_: IOException) {
        }
        t.out = null
        t.file.delete()
    }
}
