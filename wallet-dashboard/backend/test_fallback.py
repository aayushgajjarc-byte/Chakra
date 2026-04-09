import asyncio, logging
from chain.ethereum import _fetch_with_fallback
logging.basicConfig(level=logging.WARNING)

async def test():
    wallet = "0x8d1b04512dece9e689d629e075139cabdf2ee0d9"
    latest = 24611609
    start = latest - 200000
    txs = await _fetch_with_fallback(wallet, "txlist", start, latest, 3, "TEST normal")
    
    print(f"FINISH! Total txs found: {len(txs)}")
    if txs:
        for t in txs[:2]:
            print(f"  hash={t.get('hash', '')[:20]} val={int(t.get('value','0'))/1e18:.6f}")
    else:
        print("Still 0 transactions - the fallback returned empty.")

asyncio.run(test())
