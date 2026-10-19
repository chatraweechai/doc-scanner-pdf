package io.github.chatrawichaitech.docscanner

import io.github.chatrawichaitech.docscanner.BridgeProtocol.Kind
import io.github.chatrawichaitech.docscanner.BridgeProtocol.Message
import io.github.chatrawichaitech.docscanner.BridgeProtocol.ProtocolException
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.Base64

class TransferStoreTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private fun b64(bytes: ByteArray) = Base64.getEncoder().encodeToString(bytes)
    private fun begin(id: String, size: Long, chunks: Int, name: String = "scan.pdf") =
        Message.Begin(id, Kind.SAVE, name, "application/pdf", size, chunks)

    private fun expectFailure(block: () -> Unit) {
        try {
            block()
            fail("expected ProtocolException")
        } catch (e: ProtocolException) {
            // expected
        }
    }

    @Test
    fun assemblesChunksIntoAFile() {
        val dir = tmp.newFolder("t")
        val store = TransferStore(dir)
        val data = ByteArray(1000) { (it % 251).toByte() }
        store.begin(begin("a", 1000, 3, name = "../x.pdf"))
        store.chunk(Message.Chunk("a", 0, b64(data.copyOfRange(0, 400))))
        store.chunk(Message.Chunk("a", 1, b64(data.copyOfRange(400, 800))))
        store.chunk(Message.Chunk("a", 2, b64(data.copyOfRange(800, 1000))))
        val t = store.end(Message.End("a"))
        assertArrayEquals(data, t.file.readBytes())
        assertEquals("_x.pdf", t.name)
        assertEquals(0, store.activeCount())
    }

    @Test
    fun emptyFile() {
        val store = TransferStore(tmp.newFolder("e"))
        store.begin(begin("e", 0, 1))
        store.chunk(Message.Chunk("e", 0, ""))
        assertEquals(0L, store.end(Message.End("e")).file.length())
    }

    @Test
    fun rejectsOutOfOrderOversizedIncompleteAndCorruptData() {
        val dir = tmp.newFolder("bad")
        val store = TransferStore(dir)

        store.begin(begin("order", 10, 2))
        expectFailure { store.chunk(Message.Chunk("order", 1, b64(ByteArray(5)))) }
        expectFailure { store.chunk(Message.Chunk("order", 0, b64(ByteArray(5)))) } // ยกเลิกไปแล้ว

        store.begin(begin("big", 4, 1))
        expectFailure { store.chunk(Message.Chunk("big", 0, b64(ByteArray(5)))) }

        store.begin(begin("short", 10, 1))
        store.chunk(Message.Chunk("short", 0, b64(ByteArray(9))))
        expectFailure { store.end(Message.End("short")) }

        store.begin(begin("corrupt", 3, 1))
        expectFailure { store.chunk(Message.Chunk("corrupt", 0, "@@@")) }

        store.begin(begin("extra", 4, 1))
        store.chunk(Message.Chunk("extra", 0, b64(ByteArray(4))))
        expectFailure { store.chunk(Message.Chunk("extra", 1, b64(ByteArray(0)))) }

        expectFailure { store.chunk(Message.Chunk("unknown", 0, "")) }
        expectFailure { store.end(Message.End("unknown")) }
        assertEquals(0, store.activeCount())
        assertTrue("temporary files removed", dir.listFiles()!!.isEmpty())
    }

    @Test
    fun limitsConcurrentTransfersAndDuplicates() {
        val dir = tmp.newFolder("limit")
        val store = TransferStore(dir, maxActive = 2)
        store.begin(begin("a", 1, 1))
        expectFailure { store.begin(begin("a", 1, 1)) }
        store.begin(begin("b", 1, 1))
        expectFailure { store.begin(begin("c", 1, 1)) }
        store.abortAll()
        assertEquals(0, store.activeCount())
        assertTrue(dir.listFiles()!!.isEmpty())
    }
}
