import asyncio
import edge_tts

async def amain():
    communicate = edge_tts.Communicate("Xin chào", "vi-VN-NamMinhNeural")
    await communicate.save("test_edge_python.mp3")

if __name__ == "__main__":
    asyncio.run(amain())
    print("Done")
