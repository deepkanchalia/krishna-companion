const reflections = [
  {
    reference: "Bhagavad-gītā As It Is 1.1",
    chapter: "Chapter One · Observing the Armies",
    shloka: "धृतराष्ट्र उवाच\nधर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।\nमामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥ १ ॥",
    transliteration: "dhṛtarāṣṭra uvāca · dharma-kṣetre kuru-kṣetre\nsamavetā yuyutsavaḥ · māmakāḥ pāṇḍavāś caiva · kim akurvata sañjaya",
    translation: "Dhṛtarāṣṭra said: O Sañjaya, after my sons and the sons of Pāṇḍu assembled at Kurukṣetra…",
    meaning: "Attachment divided one family into “mine” and “theirs.”\nPartiality clouds spiritual vision.",
    source: "https://vedabase.io/en/library/bg/1/1/"
  },
  {
    reference: "Bhagavad-gītā As It Is 1.2",
    chapter: "Chapter One · Observing the Armies",
    shloka: "सञ्जय उवाच\nदृष्ट्वा तु पाण्डवानीकं व्यूढं दुर्योधनस्तदा ।\nआचार्यमुपसङ्गम्य राजा वचनमब्रवीत् ॥ २ ॥",
    transliteration: "sañjaya uvāca · dṛṣṭvā tu pāṇḍavānīkaṁ\nvyūḍhaṁ duryodhanas tadā · ācāryam upasaṅgamya · rājā vacanam abravīt",
    translation: "Sañjaya said: O King, after looking over the army arranged in military formation by the sons of Pāṇḍu…",
    meaning: "Duryodhana’s outward authority concealed fear within.\nDisturbance reveals where confidence truly rests.",
    source: "https://vedabase.io/en/library/bg/1/2/"
  },
  {
    reference: "Bhagavad-gītā As It Is 1.3",
    chapter: "Chapter One · Observing the Armies",
    shloka: "पश्यैतां पाण्डुपुत्राणामाचार्य महतीं चमूम् ।\nव्यूढां द्रुपदपुत्रेण तव शिष्येण धीमता ॥ ३ ॥",
    transliteration: "paśyaitāṁ pāṇḍu-putrāṇām · ācārya mahatīṁ camūm\nvyūḍhāṁ drupada-putreṇa · tava śiṣyeṇa dhīmatā",
    translation: "O my teacher, behold the great army of the sons of Pāṇḍu, so expertly arranged by your intelligent disciple the son of Drupada.",
    meaning: "Duryodhana tried to provoke his own teacher.\nA restless mind controls others, not itself.",
    source: "https://vedabase.io/en/library/bg/1/3/"
  },
  {
    reference: "Bhagavad-gītā As It Is 1.4",
    chapter: "Chapter One · Observing the Armies",
    shloka: "अत्र शूरा महेष्वासा भीमार्जुनसमा युधि ।\nयुयुधानो विराटश्च द्रुपदश्च महारथः ॥ ४ ॥",
    transliteration: "atra śūrā maheṣv-āsā · bhīmārjuna-samā yudhi\nyuyudhāno virāṭaś ca · drupadaś ca mahā-rathaḥ",
    translation: "Here in this army are many heroic bowmen equal in fighting to Bhīma and Arjuna: great fighters like Yuyudhāna, Virāṭa and Drupada.",
    meaning: "Duryodhana recognizes the strength before him.\nClear sight accepts what pride dislikes.",
    source: "https://vedabase.io/en/library/bg/1/4/"
  },
  {
    reference: "Bhagavad-gītā As It Is 1.5",
    chapter: "Chapter One · Observing the Armies",
    shloka: "धृष्टकेतुश्चेकितानः काशिराजश्च वीर्यवान् ।\nपुरुजित्कुन्तिभोजश्च शैब्यश्च नरपुङ्गवः ॥ ५ ॥",
    transliteration: "dhṛṣṭaketuś cekitānaḥ · kāśirājaś ca vīryavān\npurujit kuntibhojaś ca · śaibyaś ca nara-puṅgavaḥ",
    translation: "There are also great heroic, powerful fighters like Dhṛṣṭaketu, Cekitāna, Kāśirāja, Purujit, Kuntibhoja and Śaibya.",
    meaning: "The verse continues identifying the Pāṇḍavas’ powerful fighters.\nIt establishes the strength assembled before the battle.",
    source: "https://vedabase.io/en/library/bg/1/5/"
  },
  {
    reference: "Bhagavad-gītā As It Is 1.6",
    chapter: "Chapter One · Observing the Armies",
    shloka: "युधामन्युश्च विक्रान्त उत्तमौजाश्च वीर्यवान् ।\nसौभद्रो द्रौपदेयाश्च सर्व एव महारथाः ॥ ६ ॥",
    transliteration: "yudhāmanyuś ca vikrānta · uttamaujāś ca vīryavān\nsaubhadro draupadeyāś ca · sarva eva mahā-rathāḥ",
    translation: "There are the mighty Yudhāmanyu, the very powerful Uttamaujā, the son of Subhadrā and the sons of Draupadī.",
    meaning: "More great chariot fighters on the Pāṇḍava side are named.\nThe scale and seriousness of the coming battle become clear.",
    source: "https://vedabase.io/en/library/bg/1/6/"
  },
  {
    reference: "Bhagavad-gītā As It Is 1.7",
    chapter: "Chapter One · Observing the Armies",
    shloka: "अस्माकं तु विशिष्टा ये तान्निबोध द्विजोत्तम ।\nनायका मम सैन्यस्य संज्ञार्थं तान्ब्रवीमि ते ॥ ७ ॥",
    transliteration: "asmākaṁ tu viśiṣṭā ye · tān nibodha dvijottama\nnāyakā mama sainyasya · saṁjñārthaṁ tān bravīmi te",
    translation: "For your information, O best of the brāhmaṇas, let me tell you about the captains…",
    meaning: "Duryodhana turns to the captains of his own military force.\nHe wants Droṇa to take careful note of their strength.",
    source: "https://vedabase.io/en/library/bg/1/7/"
  },
  {
    reference: "Bhagavad-gītā As It Is 1.8",
    chapter: "Chapter One · Observing the Armies",
    shloka: "भवान्भीष्मश्च कर्णश्च कृपश्च समितिंजयः ।\nअश्वत्थामा विकर्णश्च सौमदत्तिस्तथैव च ॥ ८ ॥",
    transliteration: "bhavān bhīṣmaś ca karṇaś ca · kṛpaś ca samitiṁ-jayaḥ\naśvatthāmā vikarṇaś ca · saumadattis tathaiva ca",
    translation: "There are personalities like you, Bhīṣma, Karṇa, Kṛpa, Aśvatthāmā, Vikarṇa and the son of Somadatta called Bhūriśravā…",
    meaning: "Powerful allies may still stand on an unrighteous side.\nAbility finds value when aligned with dharma.",
    source: "https://vedabase.io/en/library/bg/1/8/"
  }
];

module.exports = { reflections };
