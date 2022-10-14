import json
import requests

mapping = {
    "Super Smash Bros.": "ssb",
    "Super Mario Bros.": "smb",
    "Chibi-Robo!":"other",
    "Yoshi's Woolly World":"other",
    "Splatoon":"spl",
    "Animal Crossing":"acc",
    "8-bit Mario":"smb",
    "Skylanders":"other",
    "Legend Of Zelda":"loz",
    "Shovel Knight":"other",
    "Kirby":"other",
    "Pokemon":"other",
    "Mario Sports Superstars":"mss",
    "Monster Hunter":"other",
    "BoxBoy!":"other",
    "Pikmin":"other",
    "Fire Emblem":"other",
    "Metroid":"other",
    "Others":"other",
    "Mega Man":"other",
    "Diablo":"other",
    "Power Pros":"other",
    "Monster Hunter Rise":"other",
    "Yu-Gi-Oh!":"other",
    "Super Nintendo World":"smb"
}

smb = {}
ssb = {}
other = {}
spl = {}
loz = {}
mss = {}

acc = {}
acc1 = {}
acc2 = {}
acc3 = {}
acc4 = {}
acc5 = {}



amiiboseries_list = json.loads(requests.get("https://amiiboapi.com/api/amiiboseries/").text)
amiibo_series = {}
for amiibo in amiiboseries_list["amiibo"]:
    amiibo_series[amiibo["key"][2:]] = mapping[amiibo["name"]]

with open("series_map.json", "w") as out:
    json.dump(amiibo_series, out, indent=4)


amiibo_list = json.loads(requests.get("https://amiiboapi.com/api/amiibo/").text)
for amiibo in amiibo_list["amiibo"]:
    compact = {}
    compact["amiiboSeries"] = amiibo["amiiboSeries"]
    compact["character"] = amiibo["character"]
    compact["gameSeries"] = amiibo["gameSeries"]
    compact["name"] = amiibo["name"]
    #id = amiibo["head"] + amiibo["tail"]
    id = amiibo["head"] + amiibo["tail"]
    accid = id[:4]
    #print(compact,id,amiibo["head"][0:4])
    try:
        type = amiibo_series[amiibo["tail"][4:6]]
        if type == "smb":
            smb[id] = f'{amiibo["amiiboSeries"]},{amiibo["name"]},{amiibo["gameSeries"]}'
        if type == "ssb":
            ssb[id] = f'{amiibo["amiiboSeries"]},{amiibo["name"]},{amiibo["gameSeries"]}'
        if type == "other":
            other[id] = f'{amiibo["amiiboSeries"]},{amiibo["name"]},{amiibo["gameSeries"]}'
        if type == "spl":
            spl[id] = f'{amiibo["amiiboSeries"]},{amiibo["name"]},{amiibo["gameSeries"]}'
        if type == "acc":
            if accid not in acc:
                acc[accid] = f'{amiibo["name"]}'
        if type == "loz":
            loz[id] = f'{amiibo["amiiboSeries"]},{amiibo["name"]},{amiibo["gameSeries"]}'
    except Exception as e:
        print(compact)

with open("smb.json", "w") as smbjson:
    json.dump(smb, smbjson, indent=4)

with open("ssb.json", "w") as ssbjson:
    json.dump(ssb, ssbjson, indent=4)

with open("loz.json", "w") as lozjson:
    json.dump(loz, lozjson, indent=4)

with open("other.json", "w") as otherjson:
    json.dump(other, otherjson, indent=4)

with open("spl.json", "w") as spljson:
    json.dump(spl, spljson, indent=4)

with open("acc.json", "w") as accjson:
    json.dump(acc, accjson, indent=4)
