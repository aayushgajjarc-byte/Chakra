import web3
code = web3.eth.get_code("0x8d1b04512dece9e689d629e075139cabdf2ee0d9")

if code == b'':
    address_type = "EOA"
else:
    address_type = "CONTRACT"