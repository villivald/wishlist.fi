# Homepage archive artwork

All artwork is locally hosted WebP. The homepage selects one of the three approved
hero images on the server for each request, after the authentication cookie has
been read. The selected artwork is rendered in the server response and remains
stable through hydration. No client-side random choice or timed slideshow runs.
Consecutive requests may select the same image. A cached browser navigation can
reuse its existing server response.

The same artwork is available on the homepage before and after sign-in; buttons
adapt to account/verification state. The empty first page of My lists reuses H01
as a compact decorative welcome image with its existing crop. No new image or
external request is needed for that welcome.

## Hero artwork

| File                             | Approved option | Work / source                                                                                                                                                                          |
| -------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero-hilma-childhood.webp`      | H01             | Hilma af Klint, _The Ten Largest, No. 2, Childhood_ (1907), [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Hilma_af_Klint_-_The_Ten_Largest_No._2_-_Childhood_-_1907.jpg) |
| `hero-shin-bijutsukai-0089.webp` | H06             | _Shin-Bijutsukai_, plate 0089 (1902), [The Public Domain Review / Smithsonian scan](https://publicdomainreview.org/collection/japanese-designs-1902/)                                  |
| `hero-redon-flowers.webp`        | H09             | Odilon Redon, _Bouquet of Flowers_ (c. 1900–1905), [The Metropolitan Museum of Art](https://www.metmuseum.org/art/collection/search/437379)                                            |

These files preserve the source aspect ratio and colours, resized to width 1200,
quality 85. CSS applies the approved cover crops: H01 at `50% 36%`, H06 at
`50% 56%`, and H09 at `50% 35%`. The frame has the same dimensions for every
variant, reserving its space before loading. Only the selected hero is preloaded.

Commons identifies the Hilma reproduction as public domain. The Japanese scan's
source labels the underlying work Public Domain U.S. and the copy No Additional
Rights. The Met identifies the Redon image as Public Domain / CC0. About links to
all three source records.

Original hero source images:

- H01: https://upload.wikimedia.org/wikipedia/commons/a/a0/Hilma_af_Klint_-_The_Ten_Largest_No._2_-_Childhood_-_1907.jpg
- H06: https://images.pdimagearchive.org/collections/shin-bijutsukai/shin-bijutsukai-0089.jpeg
- H09: https://images.metmuseum.org/CRDImages/ep/original/DT245117.jpg

## Example wishlist

Three 1000 × 750 images fill the existing 4:3 card frames. No archive image is
hotlinked at runtime.

| File                         | Work / source                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `peto-books.webp`            | John Frederick Peto, _Take Your Choice_ (1885), [National Gallery of Art](https://www.nga.gov/artworks/126162-take-your-choice)                      |
| `causey-cup-and-saucer.webp` | C02: Lillian Causey, _Cup and Saucer_ (c. 1936), [National Gallery of Art](https://www.nga.gov/artworks/19484-cup-and-saucer)                        |
| `wirt-tulips.webp`           | T01: Mrs. E. W. Wirt, _Bouquet of Tulips, from Flora's Dictionary_ (1838), [Minneapolis Institute of Art](https://collections.artsmia.org/art/73805) |

Discovered through [Arkivism](https://arkivism.com/explore) on 14 November 2026.
The NGA media is public domain / CC0; the tulip lithograph is labelled public
domain by the archive. Credits appear on the app's About page.

Original example-card source images:

- Books: https://api.nga.gov/iiif/3801b5c4-2b72-451b-b29a-fc081ee1baec/full/max/0/default.jpg
- C02: https://api.nga.gov/iiif/dedcef3d-4dbd-4184-a131-50985bb5e870/full/max/0/default.jpg
- T01: https://img.artsmia.org/web_objects_cache/073000/800/00/73805/mia_2019664_full.jpg

T01 starts at 5% from the left and 12.5% from the top, taking 90% of the source
width and a height corresponding to a 4:3 crop. This reproduces the approved
balanced-blooms framing. Books and C02 use centred 4:3 crops. Colours are
unmodified; all three are encoded at quality 85.
