// prettier-ignore
export const Adjectives = [
  "aglow", "ago", "ahead", "aided", "airy", "ajar", "akin", "alert", "alien",
  "batty", "bay", "beady", "beamy", "beat", "beefy", "beery", "cyan", "daft",
  "daily", "damn", "damp", "dandy", "dank", "dark", "dated", "dazed", "matte",
  "mauve", "mealy", "mean", "meaty", "meek", "pop", "port", "posed", "slav",
  "sleek", "slick", "slim", "waxed", "waxen",
];

// prettier-ignore
export const Nouns = [
  "add", "adder", "adept", "advil", "beret", "berry", "bet", "beta", "bevel",
  "bevy", "bias", "cage", "cager", "cake", "dirt", "disc", "disco", "futon",
  "fuze", "fuzz", "gag", "gage", "gain", "game", "hydra", "hyena", "hymn",
  "hype", "ibis", "ice", "icing", "icon", "lunch", "lung", "lure", "lush",
  "lying", "mace", "macro", "madam", "mafia", "push", "put", "putt", "putty",
  "quack", "quad", "quake", "qualm", "quirk", "quirt", "quiz", "quota", "quote",
  "race", "racer", "rad", "runt", "ruse", "rush", "rust", "rut", "saber", "safe",
  "sag", "saga",
];

// prettier-ignore
export const FirstNamesMale = [
  "John", "William", "James", "George", "Charles", "Frank", "Joseph", "Henry",
  "Robert", "Thomas", "Edward", "Harry", "Walter", "Fred", "Arthur", "Albert",
  "Clarence", "Samuel", "Louis", "Grover", "Ernest", "David", "Charlie", "Roy",
  "Joe", "Richard", "Will", "Oscar", "Willie", "Andrew", "Jesse", "Daniel", "Peter",
  "Carl", "Sam", "Earl", "Frederick", "Benjamin", "Alfred", "Elmer", "Howard", "Lewis",
  "Paul", "Ralph", "Herbert", "Jim", "Michael", "Tom", "Martin", "Lee", "Eugene",
  "Claude", "Jacob", "Ed", "Herman", "Francis", "Clyde", "Raymond", "Harvey", "Edgar",
  "Jack", "Ben", "Edwin", "Lawrence", "Charley", "Bert", "Chester", "Guy", "Otto",
  "Floyd", "Luther", "Oliver", "Hugh", "Ray", "Ira", "Homer", "Patrick", "Alexander",
  "Isaac", "Leonard", "Jessie", "Harold", "Leo", "Theodore", "Archie", "August", "Allen",
  "Sidney", "Philip", "Leroy", "Bernard", "Alex", "Stephen", "Horace", "Anthony", "Warren",
  "Julius", "Cleveland", "Leon", "Victor", "Eddie",
];

// prettier-ignore
export const FirstNamesFemale = [
  "Mary", "Anna", "Emma", "Elizabeth", "Margaret", "Minnie", "Clara", "Bertha", "Ida",
  "Annie", "Alice", "Florence", "Bessie", "Grace", "Ethel", "Nellie", "Martha", "Sarah",
  "Ella", "Mabel", "Laura", "Carrie", "Cora", "Maude", "Rose", "Pearl", "Lillian", "Helen",
  "Gertrude", "Edna", "Edith", "Julia", "Jennie", "Myrtle", "Mattie", "Hattie", "Lillie",
  "Eva", "Louise", "Jessie", "Lula", "Marie", "Ada", "Lena", "Catherine", "Frances",
  "Fannie", "Josephine", "Dora", "Katherine", "Maggie", "Lucy", "Blanche", "Agnes",
  "Elsie", "Nora", "Stella", "Rosa", "Effie", "Daisy", "May", "Mamie", "Mae", "Ellen",
  "Lizzie", "Nettie", "Nancy", "Alma", "Sadie", "Ruth", "Della", "Susie", "Sallie", "Flora",
  "Maud", "Addie", "Lydia", "Caroline", "Mollie", "Lottie", "Katie", "Irene", "Etta",
  "Georgia", "Lulu", "Olive", "Emily", "Viola", "Harriet", "Amanda", "Jane", "Esther",
  "Kathryn", "Charlotte", "Willie", "Beulah", "Kate", "Ollie", "Rebecca", "Susan", "Eliza",
];

// prettier-ignore
export const LastNames = [
  "SMITH", "JOHNSON", "WILLIAMS", "BROWN", "JONES", "GARCIA", "RODRIGUEZ", "MILLER", "MARTINEZ",
  "DAVIS", "HERNANDEZ", "LOPEZ", "GONZALEZ", "WILSON", "ANDERSON", "THOMAS", "TAYLOR", "LEE",
  "MOORE", "JACKSON", "PEREZ", "MARTIN", "THOMPSON", "WHITE", "SANCHEZ", "HARRIS", "RAMIREZ",
  "CLARK", "LEWIS", "ROBINSON", "WALKER", "YOUNG", "HALL", "ALLEN", "TORRES", "NGUYEN",
  "WRIGHT", "FLORES", "KING", "SCOTT", "RIVERA", "GREEN", "HILL", "ADAMS", "BAKER", "NELSON",
  "MITCHELL", "CAMPBELL", "GOMEZ", "CARTER", "ROBERTS", "DIAZ", "PHILLIPS", "EVANS", "TURNER",
  "REYES", "CRUZ", "PARKER", "EDWARDS", "COLLINS", "STEWART", "MORRIS", "MORALES", "ORTIZ",
  "GUTIERREZ", "MURPHY", "ROGERS", "COOK", "KIM", "MORGAN", "COOPER", "RAMOS", "PETERSON",
  "GONZALES", "BELL", "REED", "BAILEY", "CHAVEZ", "KELLY", "HOWARD", "RICHARDSON", "WARD",
  "COX", "RUIZ", "BROOKS", "WATSON", "WOOD", "JAMES", "MENDOZA", "GRAY", "BENNETT", "ALVAREZ",
  "CASTILLO", "PRICE", "HUGHES", "VASQUEZ", "SANDERS", "JIMENEZ", "LONG", "FOSTER",
].map(n => n[0] + n.toLowerCase().substring(1));

export const Salutations = {
  COMMON: ["Mr", "Master", "Ms", "Miss", "Mrs", "Mx"],
  SCIENCE: ["Dr", "Prof"],
  FORMAL: ["Sir", "Madam", "Dame", "Lord", "Lady", "Viscount"],
  RELIGION: ["Br", "Sr", "Fr", "Rev", "Pr", "Elder", "Revd Father", "Revd Canon"],
  POLITICS: ["The Hon", "The Hon Mrs", "Rt Hon Lord"],
  LAW: ["Judge"],
  MILITARY: [
    "Capt",
    "Major",
    "Lt-Col",
    "Col",
    "Lt-Cmdr",
    "Cmdr",
    "Flt Lt",
    "Brgdr",
    "Wng Cmdr",
    "Group Capt",
    "Maj-Gen",
    "Air Cdre",
    "Rear Admrl"
  ]
};

export const Colours = {
  PATH_SHORT: "#08ed04",
  PATH_LONG: "#cb06c5",
  PATH_STUCK: "#fff700",
  ATTACK_RANGE: "#ac5f5f"
};

export function GetRandomName() {
  const salutationGroups = Object.values(Salutations);
  const salutationGroup = salutationGroups[Math.floor(Math.random() * salutationGroups.length)];
  const salutation = salutationGroup[Math.floor(Math.random() * salutationGroup.length)];
  const male = Math.random() > 0.5;
  const fn = male
    ? FirstNamesMale[Math.floor(Math.random() * FirstNamesMale.length)]
    : FirstNamesFemale[Math.floor(Math.random() * FirstNamesFemale.length)];
  const ln = LastNames[Math.floor(Math.random() * LastNames.length)];
  return [salutation, fn, ln].join(" ");
}

export function GetRandomSuffix() {
  const adj1 = Adjectives[Math.floor(Math.random() * Adjectives.length)];
  const adj2 = Adjectives[Math.floor(Math.random() * Adjectives.length)];
  const noun = Nouns[Math.floor(Math.random() * Nouns.length)];
  return [adj1, adj2, noun].join(" ");
}
