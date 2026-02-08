def detect_chain(value: str):
    if value.startswith("0x"):
        if len(value) == 42:
            return "ethereum", "address"
        if len(value) == 66:
            return "ethereum", "tx"
    if value.startswith(("1", "3", "bc1")):
        return "bitcoin", "address"
    if len(value) == 64:
        return "bitcoin", "tx"

    return "unknown", "unknown"