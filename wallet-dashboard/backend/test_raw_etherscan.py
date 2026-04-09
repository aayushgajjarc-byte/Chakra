import os
import requests
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("ETHERSCAN_API_KEY", "").split(",")[0].strip()

url = f"https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=0x8d1b04512dece9e689d629e075139cabdf2ee0d9&startblock=0&endblock=99999999&sort=asc&apikey={key}"
print(f"Requesting URL: {url[:80]}...")
r = requests.get(url)
print("Status Code:", r.status_code)
try:
    data = r.json()
    print("Status:", data.get("status"))
    print("Message:", data.get("message"))
    print("Result items:", len(data.get("result", [])) if isinstance(data.get("result"), list) else "Not a list")
    print("Result text:", str(data.get("result"))[:100])
except Exception as e:
    print("Error parsing JSON:", e)
    print("Text:", r.text[:200])
