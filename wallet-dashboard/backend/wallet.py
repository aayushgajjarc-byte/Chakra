from chain.detector import detect_chain
from chain.ethereum import ethereum_wallet_info


async def analyze_wallet(input_value: str, hops: int, tx_limit: int = 10, page: int = 1):
    chain, input_type = detect_chain(input_value)

    if chain == "ethereum" and input_type == "address":
        return await ethereum_wallet_info(input_value, hops, tx_limit, page)

    if chain == "bitcoin":
        return {"error": "Bitcoin support not implemented yet"}

    return {"error": "Unsupported input"}
