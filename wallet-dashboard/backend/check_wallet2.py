import asyncio
from chain.ethereum import _fetch_range

async def main():
    wallet = "0x8d1b04512dece9e689d629e075139cabdf2ee0d9"
    print(f"Checking all tx types for {wallet}...")

    normal, internal, token = await asyncio.gather(
        _fetch_range(wallet, "txlist", 0, 99999999),
        _fetch_range(wallet, "txlistinternal", 0, 99999999),
        _fetch_range(wallet, "tokentx", 0, 99999999),
    )
    print(f"  txlist (normal ETH):    {len(normal)}")
    print(f"  txlistinternal:         {len(internal)}")
    print(f"  tokentx (ERC-20):       {len(token)}")

    if internal:
        print("\nFirst internal tx:")
        tx = internal[0]
        print(f"  from: {tx.get('from','?')}")
        print(f"  to:   {tx.get('to','?')}")
        print(f"  val:  {int(tx.get('value','0'))/1e18:.6f} ETH")
        print(f"  blk:  {tx.get('blockNumber','?')}")

    if token:
        print("\nFirst token tx:")
        tx = token[0]
        print(f"  symbol: {tx.get('tokenSymbol','?')}")
        print(f"  from: {tx.get('from','?')}")
        print(f"  to:   {tx.get('to','?')}")
        print(f"  value: {tx.get('value','?')}")

asyncio.run(main())
