/**
 * Editorial journey templates. These are planning suggestions, not packages: they carry no price
 * or availability. "Start planning" opens Journey Studio pre-filled, where live availability and
 * server-side pricing apply.
 */
export interface Journey {
  slug: string;
  title: string;
  length: number;
  pace: "relaxed" | "balanced" | "adventurous";
  summary: string;
  bestFor: string[];
  startDestination: string;
  art: "savanna" | "coast" | "mountain" | "lake" | "city" | "desert" | "forest";
  days: { destination: string; title: string; description: string; experienceCategory?: string }[];
  travelNotes: string;
}

export const journeys: Journey[] = [
  {
    slug: "rift-valley-and-mara",
    title: "Rift Valley lakes to the Maasai Mara",
    length: 7,
    pace: "balanced",
    summary: "Ease in with lakes and gorges near Naivasha, then spend unhurried days on the Mara's plains.",
    bestFor: ["First safari", "Wildlife", "Photography"],
    startDestination: "nairobi",
    art: "savanna",
    days: [
      { destination: "nairobi", title: "Arrive in Nairobi", description: "Settle in after your flight. If time allows, an early-morning drive in Nairobi National Park.", experienceCategory: "wildlife-safari" },
      { destination: "lake-naivasha", title: "To Lake Naivasha", description: "Drive into the Rift Valley. Afternoon boat outing to look for hippos and fish eagles.", experienceCategory: "nature" },
      { destination: "hells-gate", title: "Hell's Gate on foot or by bike", description: "Cycle among grazing zebra and walk the gorge with a local guide.", experienceCategory: "adventure" },
      { destination: "maasai-mara", title: "Into the Mara", description: "A long transfer day; arrive in time for a short evening drive or a quiet sundowner.", experienceCategory: "wildlife-safari" },
      { destination: "maasai-mara", title: "Full day on the plains", description: "Sunrise drive, rest at midday, then back out for the afternoon light.", experienceCategory: "wildlife-safari" },
      { destination: "maasai-mara", title: "Conservancy and community", description: "Learn how community conservancies work from the people who run them.", experienceCategory: "culture" },
      { destination: "nairobi", title: "Return to Nairobi", description: "Fly or drive back for your onward connection." },
    ],
    travelNotes: "Road transfers in the Rift Valley and to the Mara take several hours; Journey Studio shows estimated travel times between activities, labelled as estimates.",
  },
  {
    slug: "swahili-coast",
    title: "Swahili coast: reefs, ruins and old towns",
    length: 6,
    pace: "relaxed",
    summary: "Snorkel Watamu's marine park, wander historic Lamu and slow down on Diani's beaches.",
    bestFor: ["Beach", "History", "Food"],
    startDestination: "watamu",
    art: "coast",
    days: [
      { destination: "watamu", title: "Arrive on the north coast", description: "Settle into Watamu and walk the beach at low tide." },
      { destination: "watamu", title: "Marine park", description: "Snorkel the coral gardens with a guide; afternoon at the Gede ruins.", experienceCategory: "beach-marine" },
      { destination: "lamu", title: "Fly to Lamu", description: "Short flight and boat transfer; evening stroll along the waterfront.", experienceCategory: "history" },
      { destination: "lamu", title: "Swahili kitchen", description: "Shop for spices and cook a coastal lunch with a local host.", experienceCategory: "food" },
      { destination: "diani", title: "South to Diani", description: "Travel day; sunset dhow sail if you arrive in time.", experienceCategory: "beach-marine" },
      { destination: "diani", title: "Slow beach day", description: "Leave this one open — or look for colobus monkeys in the coastal forest." },
    ],
    travelNotes: "Coast connections usually involve a short flight or a long drive. Check current travel advisories for the Lamu area before booking.",
  },
  {
    slug: "highlands-and-forests",
    title: "Highlands, forests and mountain air",
    length: 5,
    pace: "adventurous",
    summary: "Hike Mount Kenya's lower slopes, then trade alpine moorland for Kakamega's rainforest.",
    bestFor: ["Hiking", "Birding", "Nature"],
    startDestination: "mount-kenya",
    art: "mountain",
    days: [
      { destination: "nairobi", title: "Nairobi to the mountain", description: "Drive north past tea and coffee country towards Mount Kenya." },
      { destination: "mount-kenya", title: "Guided day hike", description: "A long day on the lower slopes with a qualified mountain guide.", experienceCategory: "adventure" },
      { destination: "lake-nakuru", title: "Rhino country", description: "Break the journey west with a drive in Lake Nakuru National Park.", experienceCategory: "wildlife-safari" },
      { destination: "kakamega-forest", title: "Rainforest walks", description: "Early birding and an afternoon forest walk.", experienceCategory: "nature" },
      { destination: "kakamega-forest", title: "Depart via Kisumu", description: "Morning walk, then on to Kisumu for flights." },
    ],
    travelNotes: "This route covers long distances by road. Altitude affects everyone differently — trek with a qualified guide and take your time.",
  },
  {
    slug: "nairobi-long-weekend",
    title: "Nairobi long weekend",
    length: 3,
    pace: "balanced",
    summary: "Wildlife before breakfast, markets by lunchtime and the city's food scene after dark.",
    bestFor: ["Short stay", "Food", "Culture"],
    startDestination: "nairobi",
    art: "city",
    days: [
      { destination: "nairobi", title: "Park at dawn", description: "Early drive in Nairobi National Park with the skyline behind the plains.", experienceCategory: "wildlife-safari" },
      { destination: "nairobi", title: "Markets and makers", description: "Market walk and street food with a local host.", experienceCategory: "food" },
      { destination: "nairobi", title: "A day with a city guide", description: "Museums, galleries and crafts at your own pace with a private guide.", experienceCategory: "culture" },
    ],
    travelNotes: "Nairobi traffic is unpredictable; leave generous gaps between activities.",
  },
];

export const getJourney = (slug: string) => journeys.find((j) => j.slug === slug) ?? null;
