package io.github.chatrawichaitech.docscanner

import io.github.chatrawichaitech.docscanner.BridgeProtocol.Message
import io.github.chatrawichaitech.docscanner.BridgeProtocol.ProtocolException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class BridgeProtocolTest {
    private fun begin(extra: String = "") =
        """{"v":1,"op":"begin","id":"r1-abc","kind":"save","name":"a.pdf","mime":"application/pdf","size":10,"chunks":1$extra}"""

    private fun rejects(raw: String?, expectId: String? = "r1-abc") {
        try {
            BridgeProtocol.parse(raw)
            fail("accepted: $raw")
        } catch (e: ProtocolException) {
            assertEquals(raw, expectId, e.id)
        }
    }

    @Test
    fun parsesValidMessages() {
        assertEquals(Message.Begin("r1-abc", BridgeProtocol.Kind.SAVE, "a.pdf", "application/pdf", 10, 1), BridgeProtocol.parse(begin()))
        assertEquals(Message.Chunk("r1", 0, "QUJD"), BridgeProtocol.parse("""{"v":1,"op":"chunk","id":"r1","index":0,"data":"QUJD"}"""))
        assertEquals(Message.End("r1"), BridgeProtocol.parse("""{"v":1,"op":"end","id":"r1"}"""))
        assertEquals(Message.ShareText("r2", "ข้อความ", "t.txt"), BridgeProtocol.parse("""{"v":1,"op":"shareText","id":"r2","text":"ข้อความ","title":"t.txt"}"""))
        val share = BridgeProtocol.parse(begin().replace("\"save\"", "\"share\"")) as Message.Begin
        assertEquals(BridgeProtocol.Kind.SHARE, share.kind)
        assertEquals(Message.Lang("r3", "th"), BridgeProtocol.parse("""{"v":1,"op":"lang","id":"r3","lang":"th"}"""))
        assertEquals(Message.Lang("r4", "en"), BridgeProtocol.parse("""{"v":1,"op":"lang","id":"r4","lang":"en"}"""))
    }

    @Test
    fun languageMustBeOneTheAppHasTextsFor() {
        assertEquals(setOf("th", "en"), BridgeProtocol.LANGS)
        rejects("""{"v":1,"op":"lang","id":"r1-abc","lang":"fr"}""")
        rejects("""{"v":1,"op":"lang","id":"r1-abc","lang":"TH"}""")
        rejects("""{"v":1,"op":"lang","id":"r1-abc","lang":"../th"}""")
        rejects("""{"v":1,"op":"lang","id":"r1-abc","lang":1}""")
        rejects("""{"v":1,"op":"lang","id":"r1-abc"}""")
    }

    @Test
    fun rejectsBadMessagesWithoutAnId() {
        rejects(null, null)
        rejects("not json", null)
        rejects("[]", null)
        rejects("""{"v":1,"op":"end"}""", null)
        rejects("""{"v":1,"op":"end","id":"../x"}""", null)
        rejects("""{"v":1,"op":"end","id":123}""", null)
        rejects("""{"v":1,"op":"end","id":"${"a".repeat(65)}"}""", null)
        rejects("x".repeat(BridgeProtocol.MAX_MESSAGE_CHARS + 1), null)
    }

    @Test
    fun rejectsBadFieldsWithTheirId() {
        rejects(begin().replace("\"v\":1", "\"v\":2"))
        rejects(begin().replace("\"begin\"", "\"exec\""))
        rejects(begin().replace("\"save\"", "\"delete\""))
        rejects(begin().replace("application/pdf", "text/html"))
        rejects(begin().replace("\"size\":10", "\"size\":-1"))
        rejects(begin().replace("\"size\":10", "\"size\":1.5"))
        rejects(begin().replace("\"size\":10", "\"size\":\"10\""))
        rejects(begin().replace("\"size\":10", "\"size\":${BridgeProtocol.MAX_FILE_BYTES + 1}"))
        rejects(begin().replace("\"chunks\":1", "\"chunks\":0"))
        rejects(begin().replace("\"chunks\":1", "\"chunks\":11"))
        rejects(begin().replace("\"name\":\"a.pdf\"", "\"name\":null"))
        rejects("""{"v":1,"op":"chunk","id":"r1-abc","index":-1,"data":""}""")
        rejects("""{"v":1,"op":"chunk","id":"r1-abc","index":0}""")
        rejects("""{"v":1,"op":"shareText","id":"r1-abc","text":""}""")
    }

    @Test
    fun repliesAreJson() {
        val ok = JSONObject(BridgeProtocol.ok("r1", "saved"))
        assertEquals(true, ok.getBoolean("ok"))
        assertEquals("saved", ok.getString("result"))
        val err = JSONObject(BridgeProtocol.error("r1", "ผิด \"พลาด\" </script>"))
        assertEquals(false, err.getBoolean("ok"))
        assertEquals("ผิด \"พลาด\" </script>", err.getString("error"))
        assertNull(err.opt("result"))
    }
}
