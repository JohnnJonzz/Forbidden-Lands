// Ported data from the user-supplied Ravenland Hex-Flower Weather v2.0.
// Wind glyphs retain the original transcription uncertainty.
export const WEATHER_SOURCE_SHA256 = "8f19663ef8c8edb264dbdba8e9e735205403c70c8d45d5cfeeb5b8e8f55e3d16";
export const DELTAS = [[0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]] as const;
export const DIR_NAMES = ['N', 'NE', 'SE', 'S', 'SW', 'NW'] as const;
export const PHASES = ['springrise', 'springwane', 'summerrise', 'summerwane',
    'fallrise', 'fallwane', 'winterrise', 'winterwane'] as const;
export const PHASE_TITLES = {
    springrise: 'Springrise', springwane: 'Springwane',
    summerrise: 'Summerrise', summerwane: 'Summerwane',
    fallrise: 'Fallrise', fallwane: 'Fallwane',
    winterrise: 'Winterrise', winterwane: 'Winterwane'
} as const;
export const FLOWER_FOR = {
    springrise: 'middle', springwane: 'top',
    summerrise: 'top', summerwane: 'top',
    fallrise: 'top', fallwane: 'middle',
    winterrise: 'bottom', winterwane: 'bottom'
} as const;
export const NAV = {
    springrise: [12, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    springwane: [12, 2, 7, 3, 8, 4, 9, 5, 10, 6, 11],
    summerrise: [12, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    summerwane: [12, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    fallrise: [2, 12, 5, 6, 7, 8, 11, 9, 10, 3, 4],
    fallwane: [12, 10, 11, 8, 9, 6, 7, 4, 5, 2, 3],
    winterrise: [12, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    winterwane: [12, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
} as const;
export const FLOWERS = {
    top: {
        '-2,-2': 'clear/n', '-2,0': 'clear/n', '-2,2': 'drizzle/b',
        '-1,-3': 'hot/b', '-1,-1': 'clear/n', '-1,1': 'light/b', '-1,3': 'light/n',
        '0,-4': 'wild/s', '0,-2': 'light/b', '0,0': 'drizzle/b',
        '0,2': 'cloudy/n', '0,4': 'cloudy/n',
        '1,-3': 'thunder/s', '1,-1': 'heavycloud/g',
        '1,1': 'showers/b', '1,3': 'overcast/b',
        '2,-2': 'rain/g', '2,0': 'rain/g', '2,2': 'showers/b'
    },
    middle: {
        '-2,-2': 'clear/n', '-2,0': 'cloudy/b', '-2,2': 'drizzle/b',
        '-1,-3': 'hot/b', '-1,-1': 'light/b', '-1,1': 'overcast/b',
        '-1,3': 'drizzle/b',
        '0,-4': 'wild/s', '0,-2': 'heavycloud/g', '0,0': 'cloudy/n',
        '0,2': 'light/n', '0,4': 'cloudy/n',
        '1,-3': 'rain/g', '1,-1': 'showers/b', '1,1': 'showers/b',
        '1,3': 'overcast/b',
        '2,-2': 'showers/g', '2,0': 'rain/g', '2,2': 'showers/b'
    },
    bottom: {
        '-2,-2': 'clear/n', '-2,0': 'clear/n', '-2,2': 'flurry/b',
        '-1,-3': 'hot/b', '-1,-1': 'clear/n', '-1,1': 'light/b', '-1,3': 'light/n',
        '0,-4': 'wild/s', '0,-2': 'heavycloud/g', '0,0': 'cloudy/n',
        '0,2': 'cloudy/n', '0,4': 'cloudy/n',
        '1,-3': 'heavysnow/s', '1,-1': 'overcast/b',
        '1,1': 'flurry/b', '1,3': 'overcast/b',
        '2,-2': 'heavysnow/g', '2,0': 'snow/g', '2,2': 'snow/g'
    }
} as const;
export const WEATHER = {
    hot: { label: 'Hot sunny day', rain: 'Clear skies', lead: 1, emoji: '☀' },
    clear: { label: 'Clear sky', rain: 'Clear skies', lead: 1, emoji: '☀' },
    light: { label: 'Light clouds', rain: 'None', lead: 0, emoji: '⛅' },
    cloudy: { label: 'Cloudy', rain: 'None', lead: 0, emoji: '☁' },
    overcast: { label: 'Overcast', rain: 'None', lead: 0, emoji: '☁' },
    heavycloud: { label: 'Heavy clouds', rain: 'None', lead: 0, emoji: '☁' },
    drizzle: { label: 'Drizzle', rain: 'Drizzle', lead: -1, emoji: '🌦' },
    showers: { label: 'Light showers', rain: 'Drizzle', lead: -1, emoji: '🌧' },
    rain: { label: 'Heavy rain', rain: 'Downpour', lead: -2, emoji: '🌧' },
    thunder: { label: 'Thunderstorm', rain: 'Downpour', lead: -2, emoji: '⛈' },
    flurry: { label: 'Snow flurry', rain: 'Drizzle', lead: -1, emoji: '❄' },
    snow: { label: 'Snow', rain: 'Downpour', lead: -2, emoji: '❄' },
    heavysnow: { label: 'Heavy snow', rain: 'Downpour', lead: -2, emoji: '❄' },
    wild: { label: 'Wild weather', rain: 'Downpour', lead: -2, emoji: '⚠' }
} as const;
export const WIND = {
    n: { label: 'None', book: 'None', camp: 1 },
    b: { label: 'Breeze', book: 'Breeze', camp: 0 },
    g: { label: 'Windy', book: 'Gales', camp: -1 },
    s: { label: 'Strong wind', book: 'Storm', camp: -2 }
} as const;
export const WILD_EVENTS = {
    warm: [
        { w: 'thunder', wind: 's', title: 'Violent lightning storm' },
        { w: 'rain', wind: 's', title: 'Blinding wall of rain' },
        { w: 'hot', wind: 's', title: 'Scorching, wind-lashed heat' }
    ],
    cold: [
        { w: 'heavysnow', wind: 's', title: 'Raging blizzard' },
        { w: 'snow', wind: 's', title: 'Whiteout and bitter winds' },
        { w: 'thunder', wind: 's', title: 'Unseasonal thunder and freezing rain' }
    ]
} as const;
