# Google Drive Photos — Handoff Note

**Folder:** https://drive.google.com/drive/folders/1F8iCL2_oF0KteBMKPrcO3IQveSfacTnb

## Status: not auto-importable (yet)

The folder's files are **not publicly shared / download-locked**. During the build I confirmed:

- Anonymous access (what a live site visitor gets) returns a Google **sign-in page**, not the image —
  so Drive direct links (`uc?id=…`, `lh3.googleusercontent.com/d/…`) would show **broken images** to the public.
- Authenticated download endpoint returned **403 Forbidden** (the Chrome session was on `authuser=1`).
- In-page `fetch` is CORS-blocked and `<canvas>` export is tainted, so the photos can't be pulled
  programmatically either.
- Changing the folder's sharing permissions is something **you need to do** (I don't modify access controls).

The site currently uses the client's Wix CDN photos (the same business's real images, publicly hosted),
so nothing is broken — these can be swapped once the Drive originals are accessible.

## To use the Drive originals — pick one:

1. **Make the folder public** ("Anyone with the link → Viewer"), confirm download is allowed, then I can
   import them, **OR**
2. **Download the folder** yourself and drop the files into `/images/`, then I'll wire them in, **OR**
3. Make sure Chrome's **default Google account** is the one with access (the 403 was on `authuser=1`).

Once accessible, the right approach is to **download into `/images/` and serve locally** (faster, reliable,
SEO-friendly) rather than hotlinking Drive.

## Photo inventory (root of folder) — file IDs captured

Usable food photos (`https://drive.google.com/file/d/<ID>/view`):

| Suggested use | Filename | File ID |
|---|---|---|
| Hero | `dacecot_HERO.jpg` | `14wALuHm5T2fPOm1V2c_oWurbo973gKg8` |
| Hero (resized) | `dacecot_HERO resized.jpg` | `18qohPT1S9_vHgPd2v1xF7lUo5hFh4-mS` |
| Dish — Bosco Romagno | `dacecot_BoscoRomagno.jpg` | `1xKNpyewMWP65Wuw8X3sKa1WYBhaIpMlh` |
| Cacio e Pepé | `dacecot_CacioEPepe.jpg` | `1kKWqiYP_q9ZcT3LD_HkIYVswnv2RBEYI` |
| Cicchetti small bites | `dacecot_Cicchetti–ItalianSmallBites.jpg` | `1E6fUB1FZBra5pC2muTHOyD3HZy4SxOwq` |
| Ravioli — butter & sage | `dacecot_ClassicRavioliBurroreSalvia-butter&sage.jpg` | `1uREjixVSXTrE4iGi190hty8LEMlG7MKQ` |
| Ravioli — salsa al baffo | `dacecot_ClassicRavioliSalsaalbaffo.jpg` | `1v8M3knKwT45be10iPXa3ZVlZB4vmTlfx` |
| Fresh filled ravioli | `dacecot_FreshFilledRavioli350G2.jpg` | `17BXAy_ivzdn3_88kjDkuehp7jJPhCtx4` |
| Plasé (pomodoro sauce) | `dacecot_Plasé(PomodoroSauce).jpg` | `1729sfanXW3wCkng1_qixTG-svOoEYTUt` |
| Ragù alla Bolognese | `dacecot_RagùAllaBolognese.jpg` | `1PmTv4ks9D3UFrw0MTo8CFz26BmWmXOE4` |
| Logo (terracotta circle) | `DaCecot_CircleLogo_Terracotta.png` | `1S8iGeugKu9TVBMKaMYPVtEGyfl_9hwAt` |
| Sauce label — meat | `da Cecot - Meat-Based Sauce Label.png` | `1tcqmInFIDiuHEIgg9FxriaABK6GU3c7N` |
| Sauce label — dairy | `da Cecot - Dairy-Cheese-Based Sauce Label.png` | `1a27Ky6iXCFv1wzQyAaR5-rQYgs1yUWsf` |
| Sauce label — vegetarian | `da Cecot - Vegetarian Sauce Label.png` | `1lqSpgd7axNUFvUHJrIy8e0M8dYJ4pb47` |
| Pasta type label | `da Cecot - Pasta Type 1 Label.png` | `1w_NiU82qc7MCIbKQrHpnsBunpJynsGTQ` |
| Misc photo | `a1fd8637-…​.jpg` | `1tn1s60ks-mtp9xGjx7COiLIhFRWzCW9G` |

The folder also contains **subfolders** with more photography (not yet enumerated):
`Pasta Class (Oct 7)`, `Pasta Class 2 (Oct 31)`, `Pasta Class 3`, `Photo generali da Cecot`,
`food photos`, `Da decot Erica`. These would be ideal for the pasta-class / experiences pages.
