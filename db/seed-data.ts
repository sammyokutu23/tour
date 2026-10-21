/**
 * Development seed data.
 *
 * Destinations are real Kenyan places described conservatively; verify details before using copy in
 * production. Every provider, listing, price and schedule below is FICTIONAL DEMO DATA, flagged with
 * is_demo = true and labelled in the UI. No reviews or ratings are seeded, and no demo provider is
 * marked as verified.
 */

export const categories = [
  { slug: "wildlife-safari", name: "Wildlife & safari", description: "Game drives, walking safaris and conservation visits." },
  { slug: "culture", name: "Culture & community", description: "Community-hosted visits, crafts, music and living heritage." },
  { slug: "adventure", name: "Adventure", description: "Hiking, cycling, climbing and other active outings." },
  { slug: "beach-marine", name: "Beach & marine", description: "Snorkelling, dhow sailing and coastal experiences." },
  { slug: "food", name: "Food & markets", description: "Cooking classes, market walks and tastings." },
  { slug: "history", name: "History & heritage", description: "Historic towns, ruins and museums." },
  { slug: "nature", name: "Nature walks & birding", description: "Forest walks, birding and botanical outings." },
];

export const destinations = [
  {
    slug: "maasai-mara",
    name: "Maasai Mara National Reserve",
    region: "Rift Valley",
    county: "Narok",
    summary: "Rolling savanna in south-western Kenya, known for big cats and the seasonal wildebeest migration.",
    description:
      "The Maasai Mara is one of Kenya's best-known wildlife areas, adjoining Tanzania's Serengeti. Open grasslands, acacia woodland and the Mara and Talek rivers support large populations of plains game and predators. Much of the surrounding land is managed as community conservancies, where Maasai landowners partner with tourism operators.",
    latitude: -1.49,
    longitude: 35.144,
    travelStyles: ["wildlife", "photography", "culture"],
    bestTimeToVisit: "Wildlife viewing is good year-round; the migration herds are typically present from around July to October, though timing varies each year.",
    travelInfo: "Reached by road from Nairobi (a long drive) or by scheduled light aircraft to airstrips in and around the reserve. Park and conservancy fees apply and are set by the relevant authorities.",
    artVariant: "savanna",
  },
  {
    slug: "amboseli",
    name: "Amboseli National Park",
    region: "Southern",
    county: "Kajiado",
    summary: "Swamps and open plains beneath Kilimanjaro, famous for its large elephant herds.",
    description:
      "Amboseli sits near the Tanzanian border with Mount Kilimanjaro rising beyond it. Spring-fed swamps sustain wildlife through the dry season, and the park is especially known for long-studied elephant families. Views of the mountain are often clearest early in the morning.",
    latitude: -2.6527,
    longitude: 37.2606,
    travelStyles: ["wildlife", "photography"],
    bestTimeToVisit: "The drier months generally offer easier game viewing; cloud can hide Kilimanjaro at any time of year.",
    travelInfo: "Accessible by road from Nairobi or by light aircraft. Park entry fees apply.",
    artVariant: "savanna",
  },
  {
    slug: "diani",
    name: "Diani Beach",
    region: "Coast",
    county: "Kwale",
    summary: "A long white-sand beach on the south coast, with reef-sheltered water and coastal forest.",
    description:
      "Diani lies south of Mombasa along the Indian Ocean. A fringing reef shelters the lagoon, and patches of coastal forest nearby are home to colobus monkeys. Diani is a base for snorkelling trips, dhow outings and relaxed beach days.",
    latitude: -4.2797,
    longitude: 39.5947,
    travelStyles: ["beach", "marine", "relaxation"],
    bestTimeToVisit: "Coastal weather is warm year-round; the long rains usually fall around April to June.",
    travelInfo: "Reached by road from Mombasa (including the Likoni crossing) or via the Ukunda airstrip.",
    artVariant: "coast",
  },
  {
    slug: "lamu",
    name: "Lamu Old Town",
    region: "Coast",
    county: "Lamu",
    summary: "A historic Swahili town of narrow lanes, carved doors and dhows, inscribed as a UNESCO World Heritage Site.",
    description:
      "Lamu Old Town is one of the oldest continuously inhabited Swahili settlements in East Africa. Its coral-stone and mangrove-timber buildings, narrow streets and waterfront reflect centuries of Indian Ocean trade. Donkeys and boats remain common ways of getting around.",
    latitude: -2.2717,
    longitude: 40.902,
    travelStyles: ["history", "culture", "beach"],
    bestTimeToVisit: "Many visitors prefer the drier months. Check current travel advisories for the Lamu area before travelling.",
    travelInfo: "Usually reached by scheduled flight to Manda Island, followed by a short boat transfer.",
    artVariant: "coast",
  },
  {
    slug: "mount-kenya",
    name: "Mount Kenya National Park",
    region: "Central",
    county: "Meru / Nyeri / Kirinyaga",
    summary: "Africa's second-highest mountain, with glaciated peaks, alpine moorland and montane forest.",
    description:
      "Mount Kenya's slopes rise through bamboo and montane forest to moorland dotted with giant groundsels and lobelias. Point Lenana can be reached by experienced trekkers, while the technical summits require climbing skills. The mountain is part of a UNESCO World Heritage Site.",
    latitude: -0.1521,
    longitude: 37.3084,
    travelStyles: ["adventure", "hiking", "nature"],
    bestTimeToVisit: "Trekking conditions are generally better in the drier seasons; weather at altitude can change quickly at any time.",
    travelInfo: "Several trekking routes start from towns around the mountain. Altitude sickness is a real risk; trek with a qualified guide.",
    artVariant: "mountain",
  },
  {
    slug: "lake-nakuru",
    name: "Lake Nakuru National Park",
    region: "Rift Valley",
    county: "Nakuru",
    summary: "A Rift Valley soda lake and fenced sanctuary for rhinos, with flamingos at times.",
    description:
      "Lake Nakuru National Park surrounds an alkaline lake on the floor of the Rift Valley. The fenced park is an important sanctuary for black and white rhinos, and also supports buffalo, Rothschild's giraffe and many bird species. Flamingo numbers vary greatly with lake conditions.",
    latitude: -0.3667,
    longitude: 36.0833,
    travelStyles: ["wildlife", "birding"],
    bestTimeToVisit: "Open year-round. Flamingo numbers depend on water levels and are not guaranteed.",
    travelInfo: "A few hours' drive from Nairobi. Park entry fees apply.",
    artVariant: "lake",
  },
  {
    slug: "nairobi",
    name: "Nairobi",
    region: "Nairobi",
    county: "Nairobi",
    summary: "Kenya's capital, with a national park on its edge, museums, markets and a lively food scene.",
    description:
      "Nairobi is the country's main gateway and a destination in its own right. Nairobi National Park lies on the city's southern edge, while museums, galleries, markets and restaurants make it easy to spend a day or two exploring before heading out on safari.",
    latitude: -1.2921,
    longitude: 36.8219,
    travelStyles: ["culture", "food", "wildlife"],
    bestTimeToVisit: "Year-round. Traffic can be heavy, so plan generous time between activities.",
    travelInfo: "Jomo Kenyatta International Airport is the main international arrival point.",
    artVariant: "city",
  },
  {
    slug: "samburu",
    name: "Samburu National Reserve",
    region: "Northern",
    county: "Samburu",
    summary: "Arid northern landscapes along the Ewaso Ng'iro river, home to species rarely seen further south.",
    description:
      "Samburu's semi-arid scrub and riverine forest support wildlife adapted to dry country, including Grevy's zebra, reticulated giraffe, Beisa oryx, Somali ostrich and gerenuk. The Samburu people live in the surrounding region.",
    latitude: 0.5667,
    longitude: 37.5333,
    travelStyles: ["wildlife", "culture", "photography"],
    bestTimeToVisit: "Wildlife concentrates along the river in the dry seasons.",
    travelInfo: "Reached by road via Isiolo or by light aircraft. Reserve fees apply.",
    artVariant: "desert",
  },
  {
    slug: "hells-gate",
    name: "Hell's Gate National Park",
    region: "Rift Valley",
    county: "Nakuru",
    summary: "Dramatic cliffs and a gorge near Lake Naivasha where walking and cycling are permitted.",
    description:
      "Hell's Gate is known for towering cliffs, volcanic features and a narrow gorge. Because there are no large predators of concern on the main routes, visitors can explore on foot or by bicycle — an unusual opportunity among Kenya's parks. Gorge walks should be done with a local guide.",
    latitude: -0.9167,
    longitude: 36.3167,
    travelStyles: ["adventure", "hiking", "cycling"],
    bestTimeToVisit: "Avoid the gorge during heavy rain because of flash-flood risk.",
    travelInfo: "Close to Naivasha town, a few hours' drive from Nairobi.",
    artVariant: "savanna",
  },
  {
    slug: "lake-naivasha",
    name: "Lake Naivasha",
    region: "Rift Valley",
    county: "Nakuru",
    summary: "A freshwater lake fringed by acacia, with boat trips, hippos and rich birdlife.",
    description:
      "Lake Naivasha is one of the Rift Valley's freshwater lakes. Boat outings offer views of hippos and fish eagles, and nearby Crescent Island and private sanctuaries allow walking among plains game.",
    latitude: -0.7667,
    longitude: 36.35,
    travelStyles: ["nature", "birding", "relaxation"],
    bestTimeToVisit: "Year-round.",
    travelInfo: "A few hours' drive from Nairobi; combine with Hell's Gate.",
    artVariant: "lake",
  },
  {
    slug: "watamu",
    name: "Watamu",
    region: "Coast",
    county: "Kilifi",
    summary: "A north-coast village beside a marine national park, mangroves and the Gede ruins.",
    description:
      "Watamu sits beside Watamu Marine National Park, with coral gardens, sea grass and turtle nesting beaches. Mida Creek's mangroves are good for birding, and the ruins of the medieval Swahili town of Gede are close by.",
    latitude: -3.354,
    longitude: 40.0244,
    travelStyles: ["beach", "marine", "history"],
    bestTimeToVisit: "Warm year-round; sea conditions vary with the monsoon winds.",
    travelInfo: "Reached by road from Malindi or Mombasa.",
    artVariant: "coast",
  },
  {
    slug: "kakamega-forest",
    name: "Kakamega Forest",
    region: "Western",
    county: "Kakamega",
    summary: "Kenya's last remnant of Guineo-Congolian rainforest, rich in birds, butterflies and primates.",
    description:
      "Kakamega Forest in western Kenya is a fragment of the rainforest that once stretched across central Africa. It is known for its birdlife, butterflies and primates, and is best explored on foot with a local guide.",
    latitude: 0.2833,
    longitude: 34.8667,
    travelStyles: ["nature", "birding", "hiking"],
    bestTimeToVisit: "Year-round; trails can be muddy during the rains.",
    travelInfo: "Reached by road from Kisumu or Eldoret.",
    artVariant: "forest",
  },
] as const;

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DemoGuide {
  email: string;
  displayName: string;
  headline: string;
  bio: string;
  languages: string[];
  specialties: string[];
  yearsExperience: number;
  base: string;
  regions: string[];
  hours: { weekday: Weekday; start: string; end: string }[];
  services: {
    title: string;
    description: string;
    durationMinutes: number;
    pricingModel: "per_person" | "per_group";
    priceKes: number;
    maxGroupSize: number;
    bufferMinutes: number;
    minNoticeHours: number;
    policy: "flexible" | "moderate" | "strict";
  }[];
}

const weekdays = (start: string, end: string, days: Weekday[] = [1, 2, 3, 4, 5, 6]) => days.map((weekday) => ({ weekday, start, end }));
const DEMO_NOTE = "This is a fictional demo profile used for development and demonstrations.";

export const demoGuides: DemoGuide[] = [
  {
    email: "guide.achieng@demo.test",
    displayName: "Achieng O.",
    headline: "Rift Valley lakes and birding specialist",
    bio: `${DEMO_NOTE} Achieng's demo profile represents a birding guide based in Naivasha who leads gentle walks, boat outings and day trips to Lake Nakuru and Hell's Gate.`,
    languages: ["English", "Swahili", "Dholuo"],
    specialties: ["birding", "nature", "photography"],
    yearsExperience: 9,
    base: "lake-naivasha",
    regions: ["lake-naivasha", "hells-gate", "lake-nakuru", "nairobi"],
    hours: weekdays("06:30", "18:00", [0, 1, 2, 3, 4, 5]),
    services: [
      {
        title: "Full-day private guiding",
        description: "A dedicated guide for your group for the day: route planning, wildlife and bird interpretation, and help with park logistics.",
        durationMinutes: 8 * 60,
        pricingModel: "per_group",
        priceKes: 12_000,
        maxGroupSize: 7,
        bufferMinutes: 60,
        minNoticeHours: 48,
        policy: "moderate",
      },
      {
        title: "Half-day birding walk",
        description: "A slower-paced morning on foot looking for resident and migrant birds, with binoculars available to borrow.",
        durationMinutes: 4 * 60,
        pricingModel: "per_group",
        priceKes: 6_500,
        maxGroupSize: 6,
        bufferMinutes: 45,
        minNoticeHours: 24,
        policy: "flexible",
      },
    ],
  },
  {
    email: "guide.lemayian@demo.test",
    displayName: "Lemayian S.",
    headline: "Mara game drives and Maasai cultural context",
    bio: `${DEMO_NOTE} Lemayian's demo profile represents a safari guide who grew up near the Mara and focuses on predator behaviour, tracking and the relationship between communities and conservancies.`,
    languages: ["English", "Swahili", "Maa"],
    specialties: ["wildlife", "culture", "photography"],
    yearsExperience: 14,
    base: "maasai-mara",
    regions: ["maasai-mara", "amboseli", "samburu"],
    hours: weekdays("05:30", "19:00", [0, 1, 2, 3, 4, 5, 6]),
    services: [
      {
        title: "Full-day private safari guide",
        description: "Sunrise to late afternoon with a private guide. Vehicle and park fees are not included and are arranged separately.",
        durationMinutes: 9 * 60,
        pricingModel: "per_group",
        priceKes: 15_000,
        maxGroupSize: 6,
        bufferMinutes: 90,
        minNoticeHours: 72,
        policy: "strict",
      },
    ],
  },
  {
    email: "guide.baraka@demo.test",
    displayName: "Baraka M.",
    headline: "Swahili coast heritage, food and dhow trips",
    bio: `${DEMO_NOTE} Baraka's demo profile represents a coastal guide who leads old-town walks, food tours and snorkelling days between Watamu, Diani and Lamu.`,
    languages: ["English", "Swahili", "Italian"],
    specialties: ["history", "food", "marine", "culture"],
    yearsExperience: 7,
    base: "watamu",
    regions: ["watamu", "diani", "lamu"],
    hours: weekdays("08:00", "18:00"),
    services: [
      {
        title: "Half-day heritage & food walk",
        description: "A guided walk through historic lanes and markets with tastings of coastal snacks. Food purchases are included up to a modest amount.",
        durationMinutes: 4 * 60,
        pricingModel: "per_person",
        priceKes: 3_500,
        maxGroupSize: 10,
        bufferMinutes: 30,
        minNoticeHours: 24,
        policy: "flexible",
      },
      {
        title: "Full-day coastal guide",
        description: "Flexible day of guiding along the coast — combine ruins, creek walks and beach time.",
        durationMinutes: 8 * 60,
        pricingModel: "per_group",
        priceKes: 10_000,
        maxGroupSize: 8,
        bufferMinutes: 60,
        minNoticeHours: 48,
        policy: "moderate",
      },
    ],
  },
  {
    email: "guide.njeri@demo.test",
    displayName: "Njeri W.",
    headline: "Mount Kenya trekking and Nairobi city days",
    bio: `${DEMO_NOTE} Njeri's demo profile represents a mountain and city guide who plans trekking days on Mount Kenya's lower slopes and relaxed Nairobi itineraries.`,
    languages: ["English", "Swahili", "Kikuyu", "French"],
    specialties: ["hiking", "adventure", "culture", "food"],
    yearsExperience: 11,
    base: "nairobi",
    regions: ["nairobi", "mount-kenya", "hells-gate"],
    hours: weekdays("07:00", "17:30"),
    services: [
      {
        title: "Nairobi city day",
        description: "A private guide for a day in Nairobi — museums, markets, crafts and food — at your pace.",
        durationMinutes: 7 * 60,
        pricingModel: "per_group",
        priceKes: 9_000,
        maxGroupSize: 8,
        bufferMinutes: 60,
        minNoticeHours: 24,
        policy: "flexible",
      },
      {
        title: "Mountain day-hike guide",
        description: "A guided day hike on Mount Kenya's lower slopes or the Aberdares. Park fees and transport are separate.",
        durationMinutes: 9 * 60,
        pricingModel: "per_group",
        priceKes: 14_000,
        maxGroupSize: 6,
        bufferMinutes: 120,
        minNoticeHours: 72,
        policy: "moderate",
      },
    ],
  },
];

export interface DemoOperator {
  email: string;
  displayName: string;
  headline: string;
  bio: string;
  base: string;
  regions: string[];
}

export const demoOperators: DemoOperator[] = [
  {
    email: "operator.savanna@demo.test",
    displayName: "Savanna Trails Collective",
    headline: "Small-group safaris and conservancy visits",
    bio: `${DEMO_NOTE} This demo operator represents a small safari company offering shared game drives and conservancy visits.`,
    base: "maasai-mara",
    regions: ["maasai-mara", "amboseli", "lake-nakuru"],
  },
  {
    email: "operator.coast@demo.test",
    displayName: "Blue Reef Coast Experiences",
    headline: "Snorkelling, dhow sailing and coastal culture",
    bio: `${DEMO_NOTE} This demo operator represents a coastal outfitter running snorkelling trips, dhow sails and cooking classes.`,
    base: "diani",
    regions: ["diani", "watamu", "lamu"],
  },
  {
    email: "operator.highlands@demo.test",
    displayName: "Highlands & Gorges Adventures",
    headline: "Cycling, hiking and lake outings in the Rift Valley",
    bio: `${DEMO_NOTE} This demo operator represents an adventure company running bike hire, gorge walks and boat trips.`,
    base: "lake-naivasha",
    regions: ["hells-gate", "lake-naivasha", "nairobi", "kakamega-forest", "mount-kenya"],
  },
];

export interface DemoExperience {
  operator: string;
  destination: string;
  category: string;
  title: string;
  summary: string;
  description: string;
  durationMinutes: number;
  pricingModel: "per_person" | "per_group";
  priceKes: number;
  childPriceKes: number | null;
  maxGroupSize: number;
  minAge: number | null;
  inclusions: string[];
  exclusions: string[];
  meetingPoint: string;
  meetingLat: number;
  meetingLng: number;
  preparationNotes: string;
  accessibilityNotes: string;
  restrictions: string | null;
  policy: "flexible" | "moderate" | "strict";
  minNoticeHours: number;
  styles: string[];
  slotTimes: string[];
  slotDays: Weekday[];
  capacity: number;
  groupDiscount?: { minTravellers: number; percentOffBps: number };
}

const allDays: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export const demoExperiences: DemoExperience[] = [
  {
    operator: "operator.savanna@demo.test",
    destination: "maasai-mara",
    category: "wildlife-safari",
    title: "Shared sunrise game drive",
    summary: "An early-morning game drive in a shared vehicle with a window seat for every guest.",
    description:
      "Set out at first light, when predators are often most active and the light is soft. Your driver-guide follows sightings across the plains and explains animal behaviour along the way. Vehicles carry up to six guests. Wildlife sightings depend on nature and can't be guaranteed.",
    durationMinutes: 240,
    pricingModel: "per_person",
    priceKes: 7_500,
    childPriceKes: 4_500,
    maxGroupSize: 6,
    minAge: 5,
    inclusions: ["Shared 4×4 vehicle with pop-up roof", "Driver-guide", "Bottled water"],
    exclusions: ["Reserve or conservancy entry fees", "Tips"],
    meetingPoint: "Talek Gate car park (demo meeting point)",
    meetingLat: -1.4489,
    meetingLng: 35.2087,
    preparationNotes: "Bring warm layers — mornings are cold — plus a hat and sunscreen for later in the drive.",
    accessibilityNotes: "Vehicles have high steps; let the operator know in advance if you need assistance boarding.",
    restrictions: "Children under 5 can't join shared drives.",
    policy: "moderate",
    minNoticeHours: 24,
    styles: ["wildlife", "photography"],
    slotTimes: ["06:00", "15:00"],
    slotDays: allDays,
    capacity: 6,
  },
  {
    operator: "operator.savanna@demo.test",
    destination: "maasai-mara",
    category: "culture",
    title: "Conservancy community visit",
    summary: "Meet a community conservation team and learn how conservancy leases support local livelihoods.",
    description:
      "Spend the late morning with community rangers and members of a local conservancy association. Learn how land is leased for conservation, how rangers monitor wildlife, and how revenue is shared. Photography of people is only with permission.",
    durationMinutes: 150,
    pricingModel: "per_person",
    priceKes: 4_000,
    childPriceKes: 2_000,
    maxGroupSize: 12,
    minAge: null,
    inclusions: ["Community host", "Community contribution", "Tea"],
    exclusions: ["Transport to the meeting point", "Crafts purchases"],
    meetingPoint: "Community centre near Talek (demo meeting point)",
    meetingLat: -1.4401,
    meetingLng: 35.2203,
    preparationNotes: "Wear comfortable shoes; ask before photographing people.",
    accessibilityNotes: "Mostly flat ground; some uneven paths.",
    restrictions: null,
    policy: "flexible",
    minNoticeHours: 24,
    styles: ["culture"],
    slotTimes: ["10:30"],
    slotDays: [1, 2, 3, 4, 5, 6],
    capacity: 12,
  },
  {
    operator: "operator.savanna@demo.test",
    destination: "amboseli",
    category: "wildlife-safari",
    title: "Amboseli elephants afternoon drive",
    summary: "An afternoon drive around Amboseli's swamps, timed for golden light on the plains.",
    description:
      "Follow elephant families as they move to the swamps in the afternoon, with Kilimanjaro as a backdrop when the clouds allow. Your guide will share how researchers have followed Amboseli's elephants for decades.",
    durationMinutes: 210,
    pricingModel: "per_person",
    priceKes: 7_000,
    childPriceKes: 4_000,
    maxGroupSize: 6,
    minAge: 5,
    inclusions: ["Shared 4×4 vehicle", "Driver-guide", "Bottled water"],
    exclusions: ["Park entry fees", "Tips"],
    meetingPoint: "Kimana Gate (demo meeting point)",
    meetingLat: -2.7445,
    meetingLng: 37.4583,
    preparationNotes: "Dust can be heavy; bring a scarf and protection for cameras.",
    accessibilityNotes: "High vehicle steps.",
    restrictions: "Children under 5 can't join shared drives.",
    policy: "moderate",
    minNoticeHours: 24,
    styles: ["wildlife", "photography"],
    slotTimes: ["14:30"],
    slotDays: allDays,
    capacity: 6,
  },
  {
    operator: "operator.savanna@demo.test",
    destination: "lake-nakuru",
    category: "wildlife-safari",
    title: "Lake Nakuru rhino drive",
    summary: "A half-day drive through the fenced sanctuary looking for rhinos, buffalo and lakeshore birds.",
    description:
      "Lake Nakuru is one of the better places in Kenya to look for rhinos. This half-day drive explores the woodland and lakeshore, with stops at viewpoints. Flamingo numbers vary with lake conditions.",
    durationMinutes: 240,
    pricingModel: "per_group",
    priceKes: 18_000,
    childPriceKes: null,
    maxGroupSize: 6,
    minAge: null,
    inclusions: ["Private 4×4 vehicle for your group", "Driver-guide"],
    exclusions: ["Park entry fees", "Meals"],
    meetingPoint: "Main Gate, Nakuru (demo meeting point)",
    meetingLat: -0.3087,
    meetingLng: 36.0812,
    preparationNotes: "Binoculars recommended.",
    accessibilityNotes: "Private vehicle; stops can be adjusted to your needs.",
    restrictions: null,
    policy: "moderate",
    minNoticeHours: 24,
    styles: ["wildlife", "birding"],
    slotTimes: ["07:00", "13:30"],
    slotDays: allDays,
    capacity: 1,
  },
  {
    operator: "operator.coast@demo.test",
    destination: "watamu",
    category: "beach-marine",
    title: "Marine park snorkelling trip",
    summary: "A glass-bottom boat trip to Watamu's coral gardens with time to snorkel.",
    description:
      "Head out at low tide to the coral gardens of the marine park. Snorkel gear is provided and a guide stays in the water with the group. Trips run with the tides and may be rescheduled for sea conditions.",
    durationMinutes: 180,
    pricingModel: "per_person",
    priceKes: 4_500,
    childPriceKes: 3_000,
    maxGroupSize: 14,
    minAge: 6,
    inclusions: ["Boat transfer", "Snorkel, mask and fins", "In-water guide"],
    exclusions: ["Marine park fees", "Reef-safe sunscreen"],
    meetingPoint: "Watamu beach access (demo meeting point)",
    meetingLat: -3.3628,
    meetingLng: 40.0195,
    preparationNotes: "Basic swimming ability required. Bring reef-safe sunscreen and a towel.",
    accessibilityNotes: "Boarding from the beach involves wading.",
    restrictions: "Not suitable for non-swimmers or children under 6.",
    policy: "flexible",
    minNoticeHours: 24,
    styles: ["marine", "beach"],
    slotTimes: ["09:00"],
    slotDays: allDays,
    capacity: 14,
    groupDiscount: { minTravellers: 4, percentOffBps: 1000 },
  },
  {
    operator: "operator.coast@demo.test",
    destination: "diani",
    category: "beach-marine",
    title: "Sunset dhow sail",
    summary: "Sail the lagoon on a traditional dhow as the sun goes down.",
    description:
      "Board a wooden dhow for a calm sail inside the reef. The crew raise the lateen sail and share stories of coastal boatbuilding while you watch the sunset. Soft drinks and light snacks are served.",
    durationMinutes: 150,
    pricingModel: "per_person",
    priceKes: 5_000,
    childPriceKes: 2_500,
    maxGroupSize: 20,
    minAge: null,
    inclusions: ["Dhow and crew", "Soft drinks and snacks", "Life jackets"],
    exclusions: ["Transport to the beach", "Alcoholic drinks"],
    meetingPoint: "Diani beach, near the public access path (demo meeting point)",
    meetingLat: -4.3156,
    meetingLng: 39.5761,
    preparationNotes: "Bring a light jacket for the breeze.",
    accessibilityNotes: "Boarding from the beach involves wading; crew can assist.",
    restrictions: null,
    policy: "flexible",
    minNoticeHours: 12,
    styles: ["beach", "relaxation"],
    slotTimes: ["16:30"],
    slotDays: allDays,
    capacity: 20,
  },
  {
    operator: "operator.coast@demo.test",
    destination: "lamu",
    category: "food",
    title: "Swahili cooking class",
    summary: "Shop for spices and cook a coastal Swahili lunch with a home cook.",
    description:
      "Start with a short walk to buy fresh ingredients, then cook a Swahili lunch together — think coconut curries, pilau and chapati — before sitting down to eat.",
    durationMinutes: 210,
    pricingModel: "per_person",
    priceKes: 4_800,
    childPriceKes: 2_400,
    maxGroupSize: 8,
    minAge: null,
    inclusions: ["Ingredients", "Lunch", "Recipe cards"],
    exclusions: ["Drinks other than water and tea"],
    meetingPoint: "Lamu waterfront (demo meeting point)",
    meetingLat: -2.2697,
    meetingLng: 40.9025,
    preparationNotes: "Tell the host about allergies and dietary needs when booking.",
    accessibilityNotes: "Takes place in a home with a few steps at the entrance.",
    restrictions: null,
    policy: "moderate",
    minNoticeHours: 24,
    styles: ["food", "culture"],
    slotTimes: ["10:00"],
    slotDays: [1, 2, 3, 4, 5, 6],
    capacity: 8,
  },
  {
    operator: "operator.highlands@demo.test",
    destination: "hells-gate",
    category: "adventure",
    title: "Hell's Gate cycle & gorge walk",
    summary: "Cycle past cliffs and grazing zebra, then walk the gorge with a local guide.",
    description:
      "Collect a mountain bike near the park gate and ride the main track past cliffs and grazing herbivores. Leave the bikes for a guided walk into the gorge, which includes scrambling and some steep sections. Gorge walks are cancelled in heavy rain because of flash-flood risk.",
    durationMinutes: 300,
    pricingModel: "per_person",
    priceKes: 3_800,
    childPriceKes: 2_800,
    maxGroupSize: 12,
    minAge: 10,
    inclusions: ["Mountain bike and helmet", "Gorge guide", "Water"],
    exclusions: ["Park entry fees", "Lunch"],
    meetingPoint: "Elsa Gate, Hell's Gate (demo meeting point)",
    meetingLat: -0.8993,
    meetingLng: 36.3285,
    preparationNotes: "Closed shoes with good grip, sun protection and at least 1.5 litres of water.",
    accessibilityNotes: "Requires moderate fitness; the gorge involves scrambling.",
    restrictions: "Minimum age 10. Not suitable during heavy rain.",
    policy: "flexible",
    minNoticeHours: 24,
    styles: ["adventure", "cycling", "hiking"],
    slotTimes: ["08:00"],
    slotDays: allDays,
    capacity: 12,
  },
  {
    operator: "operator.highlands@demo.test",
    destination: "lake-naivasha",
    category: "nature",
    title: "Lake Naivasha boat ride",
    summary: "A gentle boat outing to see hippos and fish eagles from a safe distance.",
    description:
      "Cruise along the lakeshore with a boat captain who knows where hippos rest and fish eagles hunt. The pace is relaxed and life jackets are provided.",
    durationMinutes: 90,
    pricingModel: "per_group",
    priceKes: 7_000,
    childPriceKes: null,
    maxGroupSize: 8,
    minAge: null,
    inclusions: ["Private boat for your group", "Captain", "Life jackets"],
    exclusions: ["Sanctuary entry fees if you add a walk"],
    meetingPoint: "Lakeshore jetty, Moi South Lake Road (demo meeting point)",
    meetingLat: -0.7811,
    meetingLng: 36.3962,
    preparationNotes: "Hat and sunscreen.",
    accessibilityNotes: "Boarding via a jetty; crew can assist.",
    restrictions: null,
    policy: "flexible",
    minNoticeHours: 12,
    styles: ["nature", "birding", "relaxation"],
    slotTimes: ["08:00", "11:00", "15:30"],
    slotDays: allDays,
    capacity: 1,
  },
  {
    operator: "operator.highlands@demo.test",
    destination: "nairobi",
    category: "wildlife-safari",
    title: "Nairobi National Park morning drive",
    summary: "A half-day game drive on the edge of the city, with the skyline behind the plains.",
    description:
      "Nairobi National Park is a rare place where you can watch plains game with a city skyline in the background. This half-day drive starts early and returns by lunchtime.",
    durationMinutes: 240,
    pricingModel: "per_group",
    priceKes: 16_000,
    childPriceKes: null,
    maxGroupSize: 6,
    minAge: null,
    inclusions: ["Private vehicle and driver-guide", "Hotel pickup within central Nairobi"],
    exclusions: ["Park entry fees"],
    meetingPoint: "Hotel pickup in central Nairobi (demo)",
    meetingLat: -1.2864,
    meetingLng: 36.8172,
    preparationNotes: "Pickup times are confirmed the day before.",
    accessibilityNotes: "Private vehicle; stops can be adjusted.",
    restrictions: null,
    policy: "moderate",
    minNoticeHours: 24,
    styles: ["wildlife"],
    slotTimes: ["06:30"],
    slotDays: allDays,
    capacity: 1,
  },
  {
    operator: "operator.highlands@demo.test",
    destination: "kakamega-forest",
    category: "nature",
    title: "Kakamega rainforest walk",
    summary: "A guided forest walk looking for primates, butterflies and forest birds.",
    description:
      "Walk shaded trails through Kenya's remaining tropical rainforest with a local guide who points out birds, butterflies, medicinal plants and monkeys. Trails can be muddy.",
    durationMinutes: 180,
    pricingModel: "per_person",
    priceKes: 2_500,
    childPriceKes: 1_500,
    maxGroupSize: 10,
    minAge: null,
    inclusions: ["Forest guide"],
    exclusions: ["Forest entry fees", "Transport"],
    meetingPoint: "Forest station (demo meeting point)",
    meetingLat: 0.3536,
    meetingLng: 34.8628,
    preparationNotes: "Waterproof shoes and insect repellent recommended.",
    accessibilityNotes: "Uneven, sometimes muddy trails.",
    restrictions: null,
    policy: "flexible",
    minNoticeHours: 24,
    styles: ["nature", "birding"],
    slotTimes: ["07:00", "14:00"],
    slotDays: allDays,
    capacity: 10,
  },
  {
    operator: "operator.highlands@demo.test",
    destination: "nairobi",
    category: "food",
    title: "Nairobi market & street food walk",
    summary: "Taste your way through a busy market and nearby food stalls with a local host.",
    description:
      "Wander a central market's produce and spice stalls, then sample popular snacks and dishes at stalls and small eateries chosen by your host.",
    durationMinutes: 180,
    pricingModel: "per_person",
    priceKes: 3_200,
    childPriceKes: 1_800,
    maxGroupSize: 10,
    minAge: null,
    inclusions: ["Host", "Tastings"],
    exclusions: ["Transport", "Additional purchases"],
    meetingPoint: "City Market entrance, Muindi Mbingu Street (demo meeting point)",
    meetingLat: -1.2833,
    meetingLng: 36.8195,
    preparationNotes: "Tell the host about dietary needs when booking.",
    accessibilityNotes: "Busy, crowded areas and some uneven pavements.",
    restrictions: null,
    policy: "flexible",
    minNoticeHours: 24,
    styles: ["food", "culture"],
    slotTimes: ["11:00"],
    slotDays: [1, 2, 3, 4, 5, 6],
    capacity: 10,
  },
];
