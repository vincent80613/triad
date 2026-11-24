export type CommandCategory = 'Server' | 'Players' | 'World' | 'Items'

export interface LibraryCommand {
  command: string
  description: string
  category: CommandCategory
}

export const COMMAND_CATEGORIES: CommandCategory[] = ['Server', 'Players', 'World', 'Items']

// Console commands are typed without a leading slash. Entries containing
// <player> or <message> are inserted into the console so they can be edited.
export const COMMAND_LIBRARY: LibraryCommand[] = [
  { category: 'Server', command: 'list', description: 'Shows every player who is online right now.' },
  { category: 'Server', command: 'save-all', description: 'Saves the world immediately instead of waiting for the next autosave.' },
  { category: 'Server', command: 'save-all flush', description: 'Saves the world and waits until every chunk is written to disk.' },
  { category: 'Server', command: 'save-off', description: 'Pauses automatic world saving. Use save-on to resume.' },
  { category: 'Server', command: 'save-on', description: 'Resumes automatic world saving.' },
  { category: 'Server', command: 'whitelist on', description: 'Only players on the whitelist may join.' },
  { category: 'Server', command: 'whitelist off', description: 'Lets anyone join, even when the whitelist is configured.' },
  { category: 'Server', command: 'whitelist list', description: 'Shows every whitelisted player.' },
  { category: 'Server', command: 'whitelist add <player>', description: 'Adds a player to the whitelist.' },
  { category: 'Server', command: 'whitelist remove <player>', description: 'Removes a player from the whitelist.' },
  { category: 'Server', command: 'op <player>', description: 'Gives a player operator powers, including all commands.' },
  { category: 'Server', command: 'deop <player>', description: 'Removes a player’s operator powers.' },
  { category: 'Server', command: 'kick <player>', description: 'Disconnects a player without banning them.' },
  { category: 'Server', command: 'ban <player>', description: 'Bans a player from this server.' },
  { category: 'Server', command: 'pardon <player>', description: 'Removes a player’s ban.' },
  { category: 'Server', command: 'say <message>', description: 'Broadcasts a message to everyone in chat.' },
  { category: 'Server', command: 'reload', description: 'Reloads datapacks, functions and loot tables.' },
  { category: 'Server', command: 'difficulty hard', description: 'Sets the world difficulty to hard.' },
  { category: 'Server', command: 'difficulty peaceful', description: 'Sets the world difficulty to peaceful; hostile mobs disappear.' },
  { category: 'Server', command: 'stop', description: 'Stops the server after saving the world.' },
  { category: 'Server', command: 'gamerule sendCommandFeedback false', description: 'Hides command results in chat. Useful for command blocks.' },
  { category: 'Server', command: 'gamerule sendCommandFeedback true', description: 'Shows command results in chat again.' },

  { category: 'Players', command: 'gamemode survival <player>', description: 'Puts a player in survival mode.' },
  { category: 'Players', command: 'gamemode creative <player>', description: 'Puts a player in creative mode.' },
  { category: 'Players', command: 'gamemode adventure <player>', description: 'Puts a player in adventure mode.' },
  { category: 'Players', command: 'gamemode spectator <player>', description: 'Puts a player in spectator mode.' },
  { category: 'Players', command: 'effect give <player> minecraft:speed 60 1', description: 'Gives Speed II for 60 seconds.' },
  { category: 'Players', command: 'effect give <player> minecraft:regeneration 30 1', description: 'Gives Regeneration II for 30 seconds.' },
  { category: 'Players', command: 'effect give <player> minecraft:night_vision 300 0', description: 'Gives night vision for five minutes.' },
  { category: 'Players', command: 'effect give <player> minecraft:instant_health 1 2', description: 'Heals a player immediately.' },
  { category: 'Players', command: 'effect clear <player>', description: 'Removes every potion effect from a player.' },
  { category: 'Players', command: 'xp add <player> 30 levels', description: 'Adds 30 experience levels.' },
  { category: 'Players', command: 'xp set <player> 0 points', description: 'Resets a player’s experience to zero.' },
  { category: 'Players', command: 'clear <player>', description: 'Clears a player’s whole inventory.' },
  { category: 'Players', command: 'spawnpoint <player> ~ ~ ~', description: 'Sets a player’s personal respawn point to where they stand.' },
  { category: 'Players', command: 'tp <player> 0 100 2', description: 'Teleports a player to the starter island spawn height.' },

  { category: 'World', command: 'time set day', description: 'Sets the time to morning.' },
  { category: 'World', command: 'time set night', description: 'Sets the time to night.' },
  { category: 'World', command: 'time add 1000', description: 'Moves time forward by 1000 ticks.' },
  { category: 'World', command: 'weather clear', description: 'Clears rain and thunder.' },
  { category: 'World', command: 'weather rain', description: 'Starts rain.' },
  { category: 'World', command: 'weather thunder', description: 'Starts a thunderstorm.' },
  { category: 'World', command: 'gamerule keepInventory true', description: 'Players keep their items when they die.' },
  { category: 'World', command: 'gamerule keepInventory false', description: 'Players drop their items when they die.' },
  { category: 'World', command: 'gamerule doDaylightCycle false', description: 'Freezes the day and night cycle.' },
  { category: 'World', command: 'gamerule doDaylightCycle true', description: 'Resumes the day and night cycle.' },
  { category: 'World', command: 'gamerule doWeatherCycle false', description: 'Stops weather from changing on its own.' },
  { category: 'World', command: 'gamerule mobGriefing false', description: 'Stops creepers, endermen and other mobs from changing blocks.' },
  { category: 'World', command: 'gamerule doMobSpawning false', description: 'Stops natural mob spawning.' },
  { category: 'World', command: 'gamerule naturalRegeneration true', description: 'Lets players heal by keeping their hunger bar full.' },
  { category: 'World', command: 'gamerule randomTickSpeed 3', description: 'Restores the default speed for crops and random block ticks.' },
  { category: 'World', command: 'setworldspawn 0 100 2', description: 'Sets the world spawn to the starter island platform.' },
  { category: 'World', command: 'seed', description: 'Shows the world seed.' },
  { category: 'World', command: 'locate structure minecraft:village_plains', description: 'Finds the nearest plains village.' },
  { category: 'World', command: 'locate biome minecraft:plains', description: 'Finds the nearest plains biome.' },
  { category: 'World', command: 'fill -3 100 -3 3 100 3 minecraft:glass', description: 'Builds a 7×7 glass platform at y=100 around 0,0.' },
  { category: 'World', command: 'forceload add 0 0', description: 'Keeps the chunk at 0,0 loaded all the time.' },
  { category: 'World', command: 'worldborder set 1000', description: 'Sets the world border to a 1000-block diameter.' },
  { category: 'World', command: 'kill @e[type=item]', description: 'Removes all dropped item entities.' },
  { category: 'World', command: 'kill @e[type=zombie]', description: 'Removes every zombie in loaded chunks.' },
  { category: 'World', command: 'summon minecraft:armor_stand 0 100 2', description: 'Places an armor stand at the starter island.' },

  { category: 'Items', command: 'give <player> minecraft:diamond 16', description: 'Gives 16 diamonds.' },
  { category: 'Items', command: 'give <player> minecraft:netherite_sword 1', description: 'Gives a netherite sword.' },
  { category: 'Items', command: 'give <player> minecraft:diamond_pickaxe 1', description: 'Gives a diamond pickaxe.' },
  { category: 'Items', command: 'give <player> minecraft:bow 1', description: 'Gives a bow.' },
  { category: 'Items', command: 'give <player> minecraft:arrow 64', description: 'Gives a stack of arrows.' },
  { category: 'Items', command: 'give <player> minecraft:elytra 1', description: 'Gives an elytra.' },
  { category: 'Items', command: 'give <player> minecraft:totem_of_undying 1', description: 'Gives a totem of undying.' },
  { category: 'Items', command: 'give <player> minecraft:golden_apple 8', description: 'Gives eight golden apples.' },
  { category: 'Items', command: 'give <player> minecraft:enchanted_golden_apple 2', description: 'Gives two enchanted golden apples.' },
  { category: 'Items', command: 'give <player> minecraft:experience_bottle 32', description: 'Gives 32 bottles of enchanting.' },
  { category: 'Items', command: 'give <player> minecraft:cooked_beef 16', description: 'Gives 16 cooked beef.' },
  { category: 'Items', command: 'give <player> minecraft:torch 64', description: 'Gives a stack of torches.' },
  { category: 'Items', command: 'give <player> minecraft:obsidian 32', description: 'Gives 32 obsidian for a nether portal.' },
  { category: 'Items', command: 'give <player> minecraft:water_bucket 1', description: 'Gives a water bucket.' },
  { category: 'Items', command: 'give <player> minecraft:lava_bucket 1', description: 'Gives a lava bucket.' },
  { category: 'Items', command: 'give <player> minecraft:tnt 16', description: 'Gives 16 TNT.' },
  { category: 'Items', command: 'give <player> minecraft:shulker_box 4', description: 'Gives four shulker boxes.' },
  { category: 'Items', command: 'enchant <player> minecraft:sharpness 5', description: 'Enchants the sword a player is holding with Sharpness V.' },
  { category: 'Items', command: 'enchant <player> minecraft:protection 4', description: 'Enchants the armor a player is holding with Protection IV.' },
  { category: 'Items', command: 'enchant <player> minecraft:efficiency 5', description: 'Enchants the tool a player is holding with Efficiency V.' },
  { category: 'Items', command: 'enchant <player> minecraft:unbreaking 3', description: 'Enchants the item a player is holding with Unbreaking III.' },
  { category: 'Items', command: 'item replace entity <player> armor.head with minecraft:diamond_helmet', description: 'Puts a diamond helmet on a player.' },
  { category: 'Items', command: 'item replace entity <player> armor.chest with minecraft:elytra', description: 'Puts an elytra in a player’s chest slot.' },
  { category: 'Items', command: 'loot give <player> loot minecraft:chests/simple_dungeon', description: 'Gives a player a dungeon chest’s loot.' },
  { category: 'Items', command: 'data get entity <player> Inventory', description: 'Shows a player’s inventory data, including item damage and enchantments.' }
]

export const GIVE_ITEMS: { id: string; label: string }[] = [
  { id: 'diamond', label: 'Diamond' },
  { id: 'diamond_sword', label: 'Diamond sword' },
  { id: 'diamond_pickaxe', label: 'Diamond pickaxe' },
  { id: 'netherite_sword', label: 'Netherite sword' },
  { id: 'netherite_pickaxe', label: 'Netherite pickaxe' },
  { id: 'netherite_chestplate', label: 'Netherite chestplate' },
  { id: 'diamond_helmet', label: 'Diamond helmet' },
  { id: 'bow', label: 'Bow' },
  { id: 'crossbow', label: 'Crossbow' },
  { id: 'trident', label: 'Trident' },
  { id: 'shield', label: 'Shield' },
  { id: 'elytra', label: 'Elytra' },
  { id: 'golden_apple', label: 'Golden apple' },
  { id: 'enchanted_golden_apple', label: 'Enchanted golden apple' },
  { id: 'ender_pearl', label: 'Ender pearl' },
  { id: 'totem_of_undying', label: 'Totem of undying' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'cooked_beef', label: 'Cooked beef' },
  { id: 'bread', label: 'Bread' },
  { id: 'torch', label: 'Torch' },
  { id: 'oak_log', label: 'Oak log' },
  { id: 'obsidian', label: 'Obsidian' },
  { id: 'water_bucket', label: 'Water bucket' },
  { id: 'lava_bucket', label: 'Lava bucket' },
  { id: 'tnt', label: 'TNT' },
  { id: 'beacon', label: 'Beacon' },
  { id: 'shulker_box', label: 'Shulker box' },
  { id: 'experience_bottle', label: 'Bottle of enchanting' },
  { id: 'fishing_rod', label: 'Fishing rod' },
  { id: 'saddle', label: 'Saddle' }
]

export interface GameruleDefinition {
  key: string
  label: string
  description: string
  type: 'bool' | 'number'
  defaultValue: string
  min?: number
  max?: number
}

export const GAMERULES: GameruleDefinition[] = [
  { key: 'keepInventory', label: 'Keep inventory', description: 'Players keep their items and XP after dying.', type: 'bool', defaultValue: 'false' },
  { key: 'doDaylightCycle', label: 'Day and night', description: 'Let the sun and moon move on their own.', type: 'bool', defaultValue: 'true' },
  { key: 'doWeatherCycle', label: 'Weather cycle', description: 'Let rain and thunder start and stop naturally.', type: 'bool', defaultValue: 'true' },
  { key: 'doMobSpawning', label: 'Mob spawning', description: 'Allow hostile and passive mobs to spawn naturally.', type: 'bool', defaultValue: 'true' },
  { key: 'mobGriefing', label: 'Mob griefing', description: 'Let creepers, endermen and other mobs change blocks.', type: 'bool', defaultValue: 'true' },
  { key: 'naturalRegeneration', label: 'Natural healing', description: 'Players heal while their hunger bar is full.', type: 'bool', defaultValue: 'true' },
  { key: 'doFireTick', label: 'Fire spread', description: 'Let fire spread and burn blocks.', type: 'bool', defaultValue: 'true' },
  { key: 'doImmediateRespawn', label: 'Instant respawn', description: 'Skip the death screen after a player dies.', type: 'bool', defaultValue: 'false' },
  { key: 'showCoordinates', label: 'Show coordinates', description: 'Display every player’s coordinates on screen.', type: 'bool', defaultValue: 'false' },
  { key: 'announceAdvancements', label: 'Announce advancements', description: 'Broadcast advancements in chat.', type: 'bool', defaultValue: 'true' },
  { key: 'commandBlockOutput', label: 'Command block output', description: 'Show command block results in chat.', type: 'bool', defaultValue: 'true' },
  { key: 'sendCommandFeedback', label: 'Command feedback', description: 'Show the result of commands to the player who ran them.', type: 'bool', defaultValue: 'true' },
  { key: 'logAdminCommands', label: 'Log admin commands', description: 'Write operator commands to the server log.', type: 'bool', defaultValue: 'true' },
  { key: 'doMobLoot', label: 'Mob loot', description: 'Let mobs drop items when killed.', type: 'bool', defaultValue: 'true' },
  { key: 'doTileDrops', label: 'Block drops', description: 'Let broken blocks drop items.', type: 'bool', defaultValue: 'true' },
  { key: 'fallDamage', label: 'Fall damage', description: 'Players take damage from falling.', type: 'bool', defaultValue: 'true' },
  { key: 'fireDamage', label: 'Fire damage', description: 'Players take damage from fire and lava.', type: 'bool', defaultValue: 'true' },
  { key: 'drowningDamage', label: 'Drowning damage', description: 'Players take damage when out of air underwater.', type: 'bool', defaultValue: 'true' },
  { key: 'freezeDamage', label: 'Freeze damage', description: 'Players take damage in powder snow.', type: 'bool', defaultValue: 'true' },
  { key: 'doInsomnia', label: 'Phantoms', description: 'Let phantoms spawn for players who stay awake.', type: 'bool', defaultValue: 'true' },
  { key: 'doPatrolSpawning', label: 'Pillager patrols', description: 'Let pillager patrols spawn.', type: 'bool', defaultValue: 'true' },
  { key: 'doTraderSpawning', label: 'Wandering traders', description: 'Let wandering traders appear.', type: 'bool', defaultValue: 'true' },
  { key: 'doWardenSpawning', label: 'Wardens', description: 'Let wardens spawn in deep dark cities.', type: 'bool', defaultValue: 'true' },
  { key: 'doVinesSpread', label: 'Vine growth', description: 'Let vines spread to nearby blocks.', type: 'bool', defaultValue: 'true' },
  { key: 'playersSleepingPercentage', label: 'Sleep percentage', description: 'How many players must sleep to skip the night.', type: 'number', defaultValue: '100', min: 0, max: 100 },
  { key: 'randomTickSpeed', label: 'Random tick speed', description: 'How fast crops, grass and random blocks update. 3 is vanilla.', type: 'number', defaultValue: '3', min: 0, max: 30 },
  { key: 'spawnRadius', label: 'Spawn radius', description: 'How far from world spawn players may appear.', type: 'number', defaultValue: '10', min: 0, max: 128 }
]
