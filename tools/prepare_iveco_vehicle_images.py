"""Prepare compact, distinct IVECO vehicle photos from the documented source set."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import tempfile
import urllib.request
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://iveco-pts.com/storage/2024/08/"
SOURCES = {
    "iveco-home.jpg": "13.IVECO-S_Way-Tco.jpg",
    "iveco-vip-1.jpg": "9.IVECO-Eurocargo-Versions-4x2-660-2.jpg",
    "iveco-vip-2.jpg": "IVECO-Eurocargo-Versions-4x4-1.jpg",
    "iveco-vip-3.jpg": "IVECO-X-Way_Rigid.jpg",
    "iveco-vip-4.jpg": "https://www.truck1.eu/img/misc/tags/misc/iveco/Iveco-TRAKKER-2.jpg",
    "iveco-vip-5.jpg": "IVECO-T-Way-Rigid-slider2.jpg",
    "iveco-vip-6.jpg": "16-IVECO-S-WAY-NGrange-Banner-Artic-1.jpg",
    "iveco-account.jpg": "IVECO-T-Way-Legendary-robustness-1.jpg",
    "iveco-withdraw.jpg": "IVECO-X-Way-All-Terains-1.jpg",
    "iveco-products.jpg": "IVECO-X-Way-Natural-Gas.jpg",
    "iveco-about-fleet.jpg": "16-IVECO-S-WAY-NGrange-Profitability-and-Sustainability-5.jpg",
    "iveco-about-truck.jpg": "9.IVECO-EUROCARGO-CNG-2.jpg",
    "iveco-support.jpg": "https://www.truck1.eu/img/misc/tags/misc/iveco/IVECO-Stralis-1.jpg",
}


def prepare(item):
    name, source = item
    url = source if source.startswith("https://") else BASE + source
    request = urllib.request.Request(url, headers={"User-Agent": "IVECO-Website-Asset-Preparation/1.0"})
    with urllib.request.urlopen(request, timeout=40) as response:
        data = response.read(12_000_001)
    if len(data) > 12_000_000:
        raise ValueError("Source photo exceeds the asset preparation limit")
    target = ROOT / "pages" / "assets" / name
    with tempfile.TemporaryDirectory(prefix="iveco-photo-") as directory:
        original = Path(directory) / "original"
        original.write_bytes(data)
        subprocess.run([
            "convert", str(original), "-auto-orient", "-background", "white",
            "-alpha", "remove", "-alpha", "off", "-resize", "1280x960>",
            "-strip", "-sampling-factor", "4:2:0", "-quality", "86", str(target)
        ], check=True)
    print(name, target.stat().st_size, url, flush=True)


if __name__ == "__main__":
    selected = {name: SOURCES[name] for name in sys.argv[1:]} if len(sys.argv) > 1 else SOURCES
    with ThreadPoolExecutor(max_workers=5) as executor:
        list(executor.map(prepare, selected.items()))
