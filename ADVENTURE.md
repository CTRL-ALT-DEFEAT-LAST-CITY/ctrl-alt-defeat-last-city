# Zones and companions

The stage tabs now unlock through quests. Rebirths and stage resets still grant
permanent upgrade currency, but are not required to unlock zones.

| Zone | Active mechanic | Next-zone objective |
| --- | --- | --- |
| Ashfall Outpost | City building and a three-part beacon project | Own 4 City Centers and install modules costing 100k, 400k and 1.2M Salvage |
| Overgrown Depot | Search three sites; invest in a camp, mill, tools and crew | Recover 5 keys, upgrade Depot Camp to level 2 and spend 500 Scrap on the gate |
| Copperworks Foundry | Follow changing recipes, process engines and deliver completed orders | Deliver 18 engines, upgrade Assembly Line to level 2 and spend 800 Parts on the gate |
| Neon Relay | Collect spawning energy in a persistent field and upgrade harvesting equipment | Collect 80 pickups and build three relay towers |
| Celestial Citadel | Disable three shields and fire a Core-powered cannon | Defeat the Guardian to enable the final Last City upgrade |

Use the **Companions** tab and select a stage to buy that zone's egg with its
own earned currency. Each zone has five pets and three equipment slots.
Equipped pets boost that zone's income and activity rewards; Outpost pets also
boost Salvage clicks. Pets and quest progress survive all rebirths and resets.

Normal hatch odds: Common 50%, Uncommon 28%, Rare 15%, Epic 6%, Legendary 1%.
After nine consecutive Common/Uncommon hatches, the next hatch guarantees Rare
or better (Rare 68.18%, Epic 27.27%, Legendary 4.55%). Rare+ resets the counter.
Each zone tracks its own pity counter.
Each equipped COPY uses one equipment slot and adds its own power. Multiple
copies of the same normal or gold pet can fill the three slots. Unequipped copies
do not add power and can be used as merge materials. Existing copies are retained.

Each zone also sells a 60-second ×2 resource booster. Active boosters cannot be
bought again until they expire. There are no real-money purchases.

Egg hatches show a four-second illustrated pet reel that slows toward the selected
companion, then reveals its rarity, name, strength and duplicate status. Skip
reveals the same reward immediately; Continue closes the result. The dialog also
offers a saved "Skip future hatch animations" setting. Escape skips during the
roll and closes after the reveal. Reduced-motion players get an instant result.
Currency, pity and the companion are saved before animation starts, so refresh,
skipping or double-pressing cannot lose a reward, redraw it or charge twice.

The Companions menu has separate Eggs and Inventory views. Inventory shows only
owned pets, with quantities, equipment status, normal/gold filters and an all-zone
filter. Each zone has three equipment slots. Equip 1 and Unequip 1 controls show
how many copies are equipped and available. Gold adds 1.25 times the standard pet's base bonus (for
example, an 8% standard bonus becomes 10%). It must be equipped from Inventory.

Equip Best fills this zone's slots with the strongest three OWNED copies, including
duplicates and gold variants. Auto-equip Best is a saved per-zone preference that
reranks equipment after hatches and merges. Slot counts are checked against owned
quantities on load and after merging; consuming copies cannot leave phantom pets
equipped.

Start Auto Hatch opens one egg at a time, waits for its reveal, pauses 0.9 seconds
on the result, then waits 0.75 seconds before opening another. Skip animations and
reduced motion still keep these delays. Stop controls are available in the egg
shop and hatch window. Auto hatch stops if funds run out, the player switches
zone/menu, opens Inventory or the merge lab, hides the game, loads a save or resets
the game. It never restarts from a save or spends offline. Stopping does not remove
the pet already purchased by the current hatch. Escape stops auto hatch; Next egg
advances the current result early while keeping the inter-egg delay.

Gold merging requires 2–6 identical NORMAL copies. Success chances are
2: 10%, 3: 25%, 4: 50%, 5: 75%, 6: 100%. ALL selected copies are consumed on
success OR failure. Success grants one gold copy; failure grants nothing. There
is no currency fee. A confirmation dialog explains the loss and lets players
choose their copy count. Unequipped copies are effectively consumed first; if
equipped copies exceed those remaining, only the excess slots are cleared.
Gold cannot be merged again. Inventory, equipment and merge
counters persist through saves and rebirths.

Generated portrait atlases cover all 25 pets in `assets/pets/`. Each atlas has a
3-column by 2-row grid; the final cell is empty. Gold artwork uses a gold-tinted
CSS variant. Generation prompts and file mapping are recorded alongside the art.

Old saves retain previously unlocked stages and receive an empty companion
inventory. Subsequent unlocks use the new quest objectives.

## Progression and rendering

Stage 1 adds six intermediate city buildings: Water Well, Community Clinic,
Recycling Station, Small Foundry, Trade Market and Observatory. Beacon modules
each add a permanent 15% Salvage bonus. Rebirth still requires only four City
Centers; it does not require the beacon or an income waiting period.

Stage 2 guarantees a key at eight searches per site and a second key at fourteen
Camp/Train searches. Searches take 4.5 seconds; crew upgrades reduce that to 2.5.
Existing earned keys are preserved. Stage 3 recipes change every six deliveries.
Processing takes eight seconds, reduced to three with cooling upgrades. Starting
an engine consumes Parts; delivering returns the input plus a profit. Production
jobs, infrastructure and quest milestones survive saves and resets.

Stage 4 starts with five pickups and spawns another every 2.8 seconds while its
field is visible. Up to ten pickups occupy distinct grid cells; they never expire.
Every eighth pickup is charged: 15 base Circuits instead of five. Collector
upgrades increase rewards, frequency upgrades speed spawning, and an optional
drone collects one pickup every six seconds. Towers need 20/45/80 lifetime
pickups and cost 150/450/900 Circuits. Extractors and capacitor banks supply
passive income so currency spending never permanently blocks the gate.

The field renderer keeps existing pickup elements and positions intact during
HUD updates. It supports keyboard focus, touch-sized targets, mobile layouts
and reduced motion. Hidden tabs and other menus do not spawn field energy.
There are thirteen zone infrastructure purchases with increasing level costs.

The dark cyberpunk interface is defined in `cyberpunk.css`, loaded after the
original stylesheet. Desktop navigation uses a left rail; the Upgrades view
pairs a scrollable shop sidebar with the resource dashboard. On small screens
the balance and next-investment card appear above the shop. Purchase meters
show actual currency funding, clamp to 0–100%, and distinguish maxed upgrades
and boss locks. All accents, button press effects and meter visuals are CSS;
JavaScript only supplies existing gameplay values. No new UI dependencies.

Run gameplay regressions with `node tests/game-regression.cjs`.

## Illustrated worlds and the story archive

The October 4 update adds five illustrated zone backdrops in `assets/zones/`,
with amber, green, copper, violet, and celestial-blue UI themes. The active zone
banner explains the setting, activity, and objective and offers shortcuts to the
zone activity and upgrade shop. Sound, effects, and full reset live in Settings;
local and cloud save status share a compact row. Mobile navigation adapts to a
three-column menu, and the archive becomes a single-column reader on small screens.

The Story Archive contains 17 original entries, from the first campfire to the
final rebuilding of the city. Stories unlock through construction, beacon
restoration, depot keys, engine deliveries, energy collection, relay towers,
Guardian shields, boss victory, and the final upgrade. The free prologue introduces
the setting. Locked entries show their requirements without exposing their titles
or narrative. Entries award no currency and do not change progression requirements.

`game.story` stores discovery timestamps and read flags. Both survive rebirths
and stage resets and are included in the existing local/cloud game snapshot.
Older saves recover entries supported by their current milestones. A full reset
starts a new archive with only the prologue. Unread badges and a non-blocking
transmission notice direct players to new entries. Players can filter by zone,
replay an unlocked entry, or explicitly mark a preview as read.

Normal HUD updates do not replace an unchanged archive. Visiting the archive
stops Auto Hatch through the existing menu-context checks. Story actions refuse
to change state during account switching. The Stage 4 collection field keeps its
persistent pickup elements and positions. The existing Effects toggle and device
reduced-motion preferences also apply to archive transitions.

Gameplay regressions now cover story conditions, spoiler protection, unread
state, replay, persistence, legacy migration, filters, automatic-spending safety,
theme HUD, and all five asset paths. Generated artwork was visually inspected;
in-browser layout and actual mobile-device performance still need verification.
