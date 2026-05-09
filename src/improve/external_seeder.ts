// External-content seeders — pull fresh, independent topic streams into the
// auto-coverage engine so the cache grows with the world, not just from the
// 40-topic evergreen list. Three sources, one per axis of the day:
//
//   - hn:        Hacker News /v0/topstories.json + /v0/item/{id}.json
//                Titles are sentence-shaped, so we run them through the same
//                Haiku extractor that picks the dominant organic topic.
//                Axis: tech / startup zeitgeist.
//   - wikipedia: Wikimedia REST /metrics/pageviews/top/en.wikipedia/all-access
//                Article slugs are already topic-shaped (e.g. "Ted_Turner"),
//                so we just clean + filter meta-pages and pick the top one
//                not seeded in the last 30 days.
//                Axis: cultural lookup (people/events the world is reading about).
//   - bbc:       BBC News RSS feed feeds.bbci.co.uk/news/rss.xml
//                Sentence-shaped headlines, Haiku-extracted like HN.
//                Axis: world news / current events.
//                (Reddit was tried first but blocks unauth requests since 2023.)
//   - arxiv:     arXiv Atom feed export.arxiv.org/api/query — recent CS/physics/
//                bio papers. Titles are sentence-shaped academic prose, so we
//                Haiku-extract concrete subject topics (not arxiv IDs / authors).
//                Axis: science / research zeitgeist.
//   - github:    GitHub /search/repositories — repos created in the last 14 days
//                with the most stars, public unauth REST. We feed `name + " - " +
//                description` strings to the same Haiku extractor used for HN/BBC
//                so each row reads like a sentence. Distinct from HN: HN is news
//                & discussion ABOUT software; github trending is what developers
//                are actively BUILDING.
//                Axis: developer-build zeitgeist.
//   - stackoverflow: Stack Exchange API /2.3/questions?site=stackoverflow — top
//                voted questions across all time. We feed the question title to
//                the Haiku extractor; distilled into the underlying technical
//                problem (e.g. "regex performance", "git history rewriting").
//                Distinct from HN/github: SO is what developers are actively
//                STUCK ON / asking about. Public unauth REST (10K req/day).
//                Axis: programming-problem zeitgeist.
//   - serverfault: Stack Exchange API /2.3/questions?site=serverfault — same
//                fetcher as stackoverflow, different `site=` param. Server Fault
//                is the sysadmin/devops/infrastructure community; titles distill
//                to topics like "nginx tuning", "ssh tunneling", "linux process
//                management" — exactly what powers a fleet operator's daily work.
//                Axis: infrastructure / sysadmin zeitgeist.
//   - superuser: Stack Exchange API /2.3/questions?site=superuser — consumer /
//                power-user computing (Windows/Mac/Linux desktop, hardware,
//                browsers, OS troubleshooting). Distinct from serverfault: SF is
//                pro sysadmin running servers; SU is the end-user fixing their
//                own machine. Titles distill to topics like "windows registry",
//                "disk partitioning", "browser caching", "wifi troubleshooting".
//                Axis: consumer / power-user computing zeitgeist.
//   - askubuntu: Stack Exchange API /2.3/questions?site=askubuntu — Ubuntu /
//                Linux-desktop community. Same fetcher as the other SE sites,
//                different `site=` param. Distinct axis from superuser (broad
//                consumer computing) and serverfault (pro server ops): AU is
//                Linux-desktop-specific — apt/snap, ppa, grub, nvidia drivers,
//                gnome/unity, dual-boot, kernel updates. Titles distill to topics
//                like "apt package management", "ppa repositories", "grub bootloader",
//                "snap packages", "linux dual boot".
//                Axis: Linux-desktop / Ubuntu zeitgeist.
//   - crossvalidated: Stack Exchange API /2.3/questions?site=stats — Cross
//                Validated, the statistics / ML / data-analysis SE site. Same
//                fetcher as the other SE sites, different `site=` param. Distinct
//                axis from arxiv (bleeding-edge papers) and stackoverflow (general
//                programming): CV is statistical methodology + ML reasoning +
//                experiment design. Titles distill to topics like "p value",
//                "bayesian inference", "logistic regression", "cross validation",
//                "confidence intervals", "random forests", "feature engineering",
//                "hypothesis testing".
//                Axis: statistics / machine-learning methodology zeitgeist.
//   - math:      Stack Exchange API /2.3/questions?site=math — Mathematics SE,
//                the pure-math community. Same fetcher as the other SE sites,
//                different `site=` param. Distinct axis from crossvalidated
//                (applied statistics + ML methodology) and arxiv (bleeding-edge
//                papers): math.SE is undergraduate-through-graduate pure math —
//                linear algebra, calculus, real analysis, group theory, number
//                theory, topology, probability theory, combinatorics. Titles
//                distill to topics like "linear algebra", "eigenvalues",
//                "integration by parts", "group theory", "modular arithmetic",
//                "infinite series", "matrix decomposition", "differential
//                equations", "complex analysis", "graph theory".
//                Axis: pure mathematics zeitgeist.
//   - codereview: Stack Exchange API /2.3/questions?site=codereview — Code
//                Review SE, the "is this code GOOD" community. Same fetcher
//                as the other SE sites, different `site=` param. Distinct axis
//                from stackoverflow (problems / "how do I X") and github
//                (artifacts / what's being SHIPPED): codereview is review-
//                pattern / idiomatic-style territory — code smells, refactoring
//                triggers, idiomatic constructs, performance vs readability
//                trade-offs. Titles distill to topics like "code refactoring",
//                "design patterns", "code smells", "single responsibility
//                principle", "premature optimization", "naming conventions",
//                "error handling patterns", "object encapsulation".
//                Axis: code-review / idiomatic-style zeitgeist.
//   - electronics: Stack Exchange API /2.3/questions?site=electronics —
//                Electrical Engineering SE, the "circuits / hardware / embedded"
//                community. Same fetcher as the other SE sites, different
//                `site=` param. Genuinely distinct axis from any of the 12
//                existing sources (none cover hardware/EE) — fills the gap
//                between pure software (SO/SF/SU/AU/CR) and physical-world
//                engineering. Titles distill to topics like "ohms law",
//                "transistor biasing", "voltage divider", "pcb routing",
//                "switching power supply", "operational amplifier", "pull-up
//                resistor", "decoupling capacitors", "i2c protocol", "spi bus",
//                "microcontroller interrupts", "adc sampling", "h-bridge",
//                "ground loops", "rf shielding".
//                Axis: electronics / EE / embedded zeitgeist.
//   - security: Stack Exchange API /2.3/questions?site=security — Information
//                Security SE, the infosec / cryptography / defensive-engineering
//                community. Same fetcher as the other SE sites, different
//                `site=` param. Genuinely distinct axis from any of the 13
//                existing sources (none cover security). Titles distill to
//                topics like "tls handshake", "password hashing", "csrf
//                protection", "sql injection", "ssl certificates", "xss
//                prevention", "key derivation function", "session management",
//                "two factor authentication", "rate limiting", "buffer
//                overflow", "zero day vulnerabilities", "public key
//                cryptography", "salting passwords", "oauth flow".
//                Axis: security / cryptography / defensive engineering zeitgeist.
//   - dsp:      Stack Exchange API /2.3/questions?site=dsp — Signal Processing
//                SE, the DSP / digital filters / spectral analysis community.
//                Same fetcher as the other SE sites, different `site=` param.
//                Genuinely distinct axis from electronics (more circuits-leaning)
//                and from math (more applied / signal-domain). Titles distill
//                to topics like "fast fourier transform", "fir filter design",
//                "iir filter stability", "windowing functions", "sampling
//                theorem", "discrete cosine transform", "z transform",
//                "convolution theorem", "spectrogram", "kalman filter",
//                "matched filter", "wavelet transform", "phase locked loop",
//                "decimation upsampling", "frequency response", "white noise".
//                Axis: digital signal processing zeitgeist.
//   - ux:        Stack Exchange API /2.3/questions?site=ux — User Experience
//                SE, the UX / interaction-design / usability community. Same
//                fetcher as the other SE sites, different `site=` param.
//                Genuinely distinct axis — no other source covers UX/design.
//                Titles distill to topics like "information architecture",
//                "form design", "navigation patterns", "user onboarding",
//                "progressive disclosure", "affordances", "fitts law", "hick
//                law", "error message design", "empty states", "loading
//                indicators", "modal dialogs", "responsive design",
//                "accessibility wcag", "mobile first design", "color contrast",
//                "typography hierarchy", "user flow", "card sorting",
//                "wireframing", "design systems", "microcopy", "dark patterns",
//                "user research". Axis: UX / interaction-design zeitgeist.
//   - biology:   Stack Exchange API /2.3/questions?site=biology — Biology SE,
//                the life-sciences community (cell biology, genetics, ecology,
//                physiology, evolution, microbiology, neuroscience, biochemistry).
//                Same fetcher as the other SE sites, different `site=` param.
//                Genuinely distinct axis — arxiv skews ML/CS, no other source
//                covers life sciences. Titles distill to topics like "cell
//                division", "dna replication", "protein folding", "genetic
//                drift", "natural selection", "enzyme kinetics", "neural
//                signaling", "photosynthesis pathways", "crispr editing",
//                "mitochondrial dna", "ribosome function", "antibody response",
//                "speciation", "ecological niche", "trophic cascade",
//                "homeostasis regulation", "cell signaling", "gene expression",
//                "meiosis recombination", "phylogenetic trees".
//                Axis: life sciences / biology zeitgeist.
//   - gis:       Stack Exchange API /2.3/questions?site=gis — Geographic
//                Information Systems SE, the GIS / mapping / spatial-analysis
//                community. Same fetcher as the other SE sites, different
//                `site=` param. Genuinely distinct axis — no other source
//                covers GIS/cartography. Titles distill to topics like
//                "coordinate reference systems", "shapefile format",
//                "geojson schema", "raster vs vector", "spatial joins",
//                "map projections", "postgis queries", "tile servers",
//                "qgis plugins", "arcgis pro", "kriging interpolation",
//                "remote sensing", "satellite imagery", "lidar processing",
//                "georeferencing", "geocoding", "openstreetmap", "spatial
//                indexing", "dem elevation models", "ndvi vegetation index",
//                "topology rules", "buffer analysis". Axis: GIS / spatial-
//                analysis / cartography zeitgeist.
//   - money:     Stack Exchange API /2.3/questions?site=money — Personal
//                Finance & Money SE, the practical-finance community
//                (budgeting, investing, taxes, retirement, mortgages,
//                credit, insurance, banking). Same fetcher as the other SE
//                sites, different `site=` param. Genuinely distinct axis —
//                no other source covers personal finance. Titles distill to
//                topics like "compound interest", "index fund investing",
//                "roth ira", "401k rollover", "mortgage amortization",
//                "credit utilization", "tax loss harvesting", "emergency
//                fund", "asset allocation", "dollar cost averaging",
//                "capital gains tax", "estate planning", "term vs whole
//                life insurance", "ach vs wire", "checking vs savings",
//                "credit score factors", "etf vs mutual fund", "bond
//                duration", "inflation hedging", "umbrella insurance".
//                Axis: personal finance / money management zeitgeist.
//   - philosophy: Stack Exchange API /2.3/questions?site=philosophy —
//                Philosophy SE, the formal-philosophy community (ethics,
//                logic, epistemology, metaphysics, philosophy of mind,
//                philosophy of science, political philosophy, aesthetics).
//                Same fetcher as the other SE sites, different `site=`
//                param. Genuinely distinct axis — no other source covers
//                philosophical reasoning or the canon of major thinkers.
//                Titles distill to topics like "categorical imperative",
//                "trolley problem", "modus ponens", "modus tollens",
//                "epistemic justification", "mind body problem", "free
//                will determinism", "moral relativism", "utilitarianism",
//                "deontological ethics", "virtue ethics", "social
//                contract", "ship of theseus", "problem of evil",
//                "ontological argument", "phenomenology", "logical
//                positivism", "the is ought gap", "qualia", "naturalistic
//                fallacy". Axis: philosophy / ethics / logic zeitgeist.
//   - cooking:   Stack Exchange API /2.3/questions?site=cooking — Seasoned
//                Advice, the culinary community (technique, ingredient
//                substitution, food chemistry, baking, knife skills,
//                preservation). Same fetcher as the other SE sites,
//                different `site=` param. Genuinely distinct axis — no
//                other source covers food / kitchen knowledge. Titles
//                distill to topics like "knife sharpening", "sourdough
//                starter", "deglazing pan", "egg substitutes",
//                "caramelization vs maillard", "ingredient substitutions",
//                "salting meat", "tempering chocolate", "stock vs broth",
//                "yeast fermentation", "emulsification", "umami flavor",
//                "pressure cooking", "sous vide", "braising vs stewing",
//                "dough hydration", "kitchen knife types", "deep fry oil
//                temperature". Axis: cooking / culinary technique zeitgeist.
//   - academia:  Stack Exchange API /2.3/questions?site=academia — Academia SE,
//                the academic-process community (publishing, advising, grants,
//                postdocs, peer review, conference protocol, PhD logistics).
//                Same fetcher as the other SE sites, different `site=` param.
//                Distinct axis from arxiv (raw bleeding-edge papers) and
//                crossvalidated (statistical method): academia.SE is about
//                NAVIGATING academia as a process. Titles distill to topics
//                like "peer review process", "h index", "thesis defense",
//                "grant writing", "conference deadlines", "postdoc search",
//                "phd advisor relationship", "journal impact factor", "open
//                access publishing", "academic conferences", "tenure track",
//                "academic citation", "predatory journals", "recommendation
//                letters", "academic plagiarism", "double blind review",
//                "thesis committee", "research ethics", "academic cv",
//                "manuscript revision". Axis: academic process / scholarly
//                career zeitgeist.
//   - diy:       Stack Exchange API /2.3/questions?site=diy — Home
//                Improvement SE, the home-repair / residential-trades
//                community (plumbing, residential electrical, drywall,
//                framing, woodworking, HVAC basics, paint/finishes,
//                tile, roofing). Same fetcher as the other SE sites,
//                different `site=` param. Genuinely distinct axis —
//                electronics covers low-voltage circuits, superuser
//                covers desktop computing; diy is hands-on residential
//                trades. Titles distill to topics like "drywall patching",
//                "stud finder", "circuit breaker", "dripping faucet",
//                "drain snake", "window flashing", "toilet flange",
//                "wood joinery", "deck staining", "grout sealing",
//                "load bearing wall", "subfloor moisture", "pex vs copper",
//                "gfci outlet", "vapor barrier", "joist hangers",
//                "shower diverter", "p trap", "miter joint", "shim
//                leveling", "thinset mortar", "drainage slope". Axis:
//                home improvement / residential trades zeitgeist.
//   - scifi:    Stack Exchange API /2.3/questions?site=scifi — Science
//                Fiction & Fantasy SE, the speculative-fiction-canon /
//                world-building / character-analysis community. Same fetcher
//                as the other SE sites, different `site=` param. Genuinely
//                distinct axis from any of the 23 prior sources — wikipedia
//                covers cultural lookup of real history/people, BBC covers
//                world news, arxiv covers science research; scifi.SE is the
//                canon-deep dive into invented universes (Star Wars / Star
//                Trek / LOTR / Harry Potter / Foundation / Dune / Discworld
//                / Westeros / cyberpunk / hard SF). Titles distill to topics
//                like "hyperspace travel", "the force jedi", "time travel
//                paradox", "middle earth geography", "asimov three laws",
//                "warp drive", "dune spice melange", "hogwarts houses",
//                "westeros politics", "alien biology", "first contact
//                protocol", "magic system rules", "lightsaber combat",
//                "ringworld engineering", "foundation psychohistory",
//                "horcrux soul magic", "ender game tactics", "dystopian
//                society", "space opera tropes", "post apocalyptic fiction".
//                Axis: speculative fiction / world-building zeitgeist.
//   - history:  Stack Exchange API /2.3/questions?site=history — History SE,
//                the academic-historiography / primary-source / period-analysis
//                community. Same fetcher as the other SE sites, different
//                `site=` param. Genuinely distinct axis from the 24 prior
//                sources — wikipedia covers cultural lookup of historical
//                people/events at a popular-encyclopedia level, BBC covers
//                world news, scifi covers INVENTED universes; history.SE is
//                the rigorous evaluation of REAL historical events with
//                primary-source citations / period-context / historiographical
//                debate. Titles distill to topics like "roman empire fall",
//                "byzantine succession", "feudal japan shogunate",
//                "industrial revolution", "ottoman empire decline",
//                "thirty years war", "renaissance florence", "ming dynasty",
//                "abbasid caliphate", "carolingian empire", "war of roses",
//                "spanish reconquista", "han dynasty silk road",
//                "napoleonic wars", "treaty of westphalia",
//                "athenian democracy", "punic wars", "viking expansion",
//                "mongol conquests", "crusades historiography",
//                "primary source analysis", "scholastic period",
//                "magna carta", "americas pre columbian".
//                Axis: academic historiography / period-analysis zeitgeist.
//                FIRST Saturday-only rotation source (v2.44): runs at hour
//                02 UTC on Saturday, replacing academia for that day. Other
//                6 days hour 02 still runs academia.
//   - gardening: Stack Exchange API /2.3/questions?site=gardening — Gardening
//                & Landscaping SE, the hands-on horticulture community
//                (plant care, soil, pests, pruning, garden design,
//                composting, irrigation, container/raised-bed growing).
//                Same fetcher as the other SE sites, different `site=` param.
//                Genuinely distinct axis from biology.SE which is academic
//                life-sciences (cell biology, evolution, neuroscience);
//                gardening.SE is practical green-thumb knowledge — soil
//                amendments, pest ID, hardiness zones, companion planting,
//                pruning windows, mulching, raised beds, drip irrigation,
//                seed starting, transplant shock, root pruning, leaf mold
//                composting. Titles distill to topics like "soil ph
//                amendments", "tomato blight prevention", "raised bed
//                construction", "companion planting", "compost troubleshooting",
//                "drip irrigation design", "pruning fruit trees", "powdery
//                mildew control", "seed starting indoors", "hardiness zone
//                planning", "mulching benefits", "container vegetable
//                gardening", "perennial division", "lawn renovation",
//                "transplant shock recovery". Axis: practical horticulture
//                / garden-management zeitgeist. SECOND Saturday-rotation
//                source (v2.45): runs at hour 19 UTC on Saturday, replacing
//                biology for that day. Other 6 days hour 19 still runs biology.
//   - chess:     Stack Exchange API /2.3/questions?site=chess — Chess SE,
//                the chess theory & analysis community (openings, middlegame
//                strategy, endgame technique, tactics, positional play,
//                tournament rules, engine analysis, historical games).
//                Same fetcher as the other SE sites, different `site=` param.
//                Genuinely distinct axis from any prior source — no math.SE
//                or codereview.SE coverage of game-theoretic strategic
//                domains; chess.SE is a deep tradition with concrete named
//                concepts (Sicilian Defense, French Defense, Ruy Lopez,
//                King's Indian, Queen's Gambit, en passant, castling rules,
//                fork/pin/skewer tactics, zugzwang, zwischenzug, Lucena
//                position, Philidor position, opposition endgame, isolated
//                queen pawn, hanging pawns, minority attack, Capablanca
//                endgame technique). Titles distill to topics like
//                "sicilian najdorf", "ruy lopez theory", "king's indian
//                defense", "queen's gambit declined", "endgame opposition",
//                "rook pawn endgames", "isolated queen pawn", "french
//                defense", "tactical motifs", "positional sacrifice",
//                "elo rating system", "fide tournament rules", "chess
//                engine analysis", "blitz time controls", "pawn structure",
//                "minority attack", "lucena position", "philidor position",
//                "zugzwang endgames", "double attack tactics", "fork pin
//                skewer", "discovered check", "castling rules", "fischer
//                random chess960". Axis: chess theory / strategic analysis
//                / game canon. THIRD Saturday-rotation source (v2.47):
//                runs at hour 12 UTC on Saturday, replacing ux for that
//                day. Other 6 days hour 12 still runs ux. Saturday now
//                has THREE rotation slots (02 history + 12 chess + 19
//                gardening), confirming a single weekday can carry
//                multiple new axes without colliding.
//   - movies:    Stack Exchange API /2.3/questions?site=movies — Movies & TV SE,
//                the film canon / narrative analysis community (plot
//                interpretation, director study, cinematography, genre
//                conventions, narrative theory, casting/production, franchise
//                continuity, foreign cinema, animation traditions, film
//                history). Same fetcher as the other SE sites, different
//                `site=` param. Genuinely distinct axis from any prior
//                source — no philosophy.SE / academia.SE / scifi.SE coverage
//                of cinema-as-cinema; movies.SE is the canon-and-craft layer
//                (auteur theory, three-act structure, montage, mise en
//                scène, hero's journey, hays code, neorealism, french new
//                wave, dogme 95, mumblecore, kuleshov effect, jump cut,
//                long take, dolly zoom, chiaroscuro lighting, foley sound
//                design, hans zimmer scoring, christopher nolan style,
//                kubrick framing, miyazaki animation, kurosawa
//                composition, hitchcock suspense, scorsese tracking
//                shots, wes anderson symmetry). Titles distill to topics
//                like "auteur theory", "three act structure", "kuleshov
//                effect", "dolly zoom shot", "long take cinematography",
//                "chiaroscuro lighting", "miyazaki animation", "kurosawa
//                composition", "hitchcock suspense", "french new wave",
//                "italian neorealism", "dogme 95 movement", "hero's
//                journey narrative", "unreliable narrator film",
//                "non linear storytelling", "mise en scene", "montage
//                editing", "diegetic sound", "foley sound design",
//                "studio system hollywood", "hays code era", "method
//                acting tradition", "screenplay structure",
//                "cinematography blocking", "production design", "color
//                grading film", "sound design narrative", "establishing
//                shot grammar", "match on action editing". Axis: film
//                canon / narrative craft / cinematic technique. FOURTH
//                Saturday-rotation source (v2.48): runs at hour 18 UTC on
//                Saturday, replacing wikipedia for that day. Other 6 days
//                hour 18 still runs wikipedia. Saturday now has FOUR
//                rotation slots (02 history + 12 chess + 18 movies + 19
//                gardening), demonstrating multi-axis weekend stacking.
//   - boardgames: Stack Exchange API /2.3/questions?site=boardgames — Board
//                & Card Games SE, the tabletop-strategy community (euro
//                games, wargames, deck-builders, abstracts, rules-arbitration,
//                component design, opening strategy, mechanic theory).
//                Same fetcher as the other SE sites, different `site=` param.
//                Genuinely distinct axis from chess.SE (one specific game) —
//                boardgames.SE covers the broader strategy / euro / wargame
//                canon (Catan, Carcassonne, Ticket to Ride, Agricola, Puerto
//                Rico, Twilight Imperium, Terraforming Mars, Wingspan,
//                Scythe, Gloomhaven, Pandemic, Magic: The Gathering,
//                Backgammon, Bridge, Go, Shogi, Poker, D&D combat). Titles
//                distill to topics like "euro game design", "worker
//                placement mechanic", "deck building strategy", "area
//                control wargame", "engine building", "auction bidding
//                mechanic", "asymmetric factions", "kingmaker problem",
//                "catan opening strategy", "carcassonne tile placement",
//                "ticket to ride routes", "puerto rico role selection",
//                "twilight imperium grand strategy", "terraforming mars
//                engine", "wingspan combos", "scythe asymmetric power",
//                "gloomhaven campaign", "magic the gathering mana curve",
//                "commander format edh", "limited draft theory", "go fuseki
//                opening", "backgammon pip count", "poker pot odds",
//                "bridge bidding convention". Axis: tabletop strategy /
//                game-design canon. FIFTH Saturday-rotation source (v2.49):
//                runs at hour 13 UTC on Saturday, replacing hn for that
//                day. Other 6 days hour 13 still runs hn. Saturday now has
//                FIVE rotation slots (02 history + 12 chess + 13 boardgames
//                + 18 movies + 19 gardening) — first weekday with a
//                FIVE-axis stack.
//   - workplace: Stack Exchange API /2.3/questions?site=workplace — The
//                Workplace SE, the career & professional-norms community
//                (management, office politics, hiring, compensation, remote
//                work, interview prep, performance reviews, team dynamics,
//                workplace ethics). Same fetcher as the other SE sites,
//                different `site=` param. Genuinely distinct axis from
//                academia.SE (academic-track careers) and money.SE (personal
//                finance) — workplace.SE covers the day-to-day professional
//                realm: salary negotiation, performance reviews, giving
//                notice, managing up, remote work etiquette, imposter
//                syndrome, behavioral interviews, IC vs management track,
//                1on1 frameworks, constructive feedback, conflict resolution,
//                burnout prevention, compensation benchmarking, stock
//                vesting, exit interviews, professional references,
//                LinkedIn optimization, mentorship, psychological safety,
//                OKRs. Titles distill to topics like "salary negotiation
//                tactics", "performance review preparation", "managing up
//                effectively", "remote work etiquette", "behavioral
//                interview star method", "1on1 meeting framework",
//                "constructive feedback delivery", "difficult conversations
//                workplace", "psychological safety team", "burnout
//                prevention", "compensation benchmarking". Axis: career /
//                professional norms / workplace dynamics. FIRST Friday-only
//                rotation source (v2.50): runs at hour 06 UTC on Friday,
//                replacing askubuntu for that day. Other 6 days hour 06
//                still runs askubuntu. OPENS the FRIDAY rotation lane —
//                first non-Saturday/non-Sunday day-specific axis since
//                v2.43 (Sun=scifi). Distribution rationale: Friday picks
//                up the work-week-ending energy as the cache rotates from
//                pure-tech (askubuntu) to professional-norms (workplace).
//   - parenting: Stack Exchange API /2.3/questions?site=parenting — Parenting
//                SE, the child-development & family-dynamics community
//                (discipline approaches, sleep training, feeding, behavior,
//                education choices, screen time, co-parenting, sibling
//                dynamics, age-appropriate development, teen autonomy).
//                Same fetcher as the other SE sites, different `site=` param.
//                Genuinely distinct axis from any prior source — no
//                psychology / human-development coverage in academia.SE
//                (which is academic-track careers); parenting.SE is the
//                applied family-life domain (attachment theory, authoritative
//                vs permissive vs free-range parenting, sleep methods like
//                Ferber/cry-it-out/cosleeping, baby-led weaning, picky
//                eating, potty training, toddler tantrums, sibling rivalry,
//                blended families, co-parenting after divorce, homeschool
//                curricula, Montessori/Waldorf/Reggio approaches, executive
//                function development, emotion coaching, growth mindset,
//                teen autonomy, screen addiction). Titles distill to topics
//                like "attachment parenting theory", "authoritative
//                parenting style", "positive discipline framework", "sleep
//                training methods", "ferber method sleep", "cosleeping
//                safety", "baby led weaning", "potty training readiness",
//                "toddler tantrums", "sibling rivalry resolution", "co
//                parenting after divorce", "montessori method home",
//                "waldorf education", "reggio emilia approach", "free
//                range parenting", "helicopter parenting effects",
//                "executive function development", "emotion coaching
//                method", "growth mindset parenting", "teen autonomy
//                negotiation", "screen addiction adolescent". Axis:
//                child development / family dynamics / domestic life canon.
//                SECOND Sunday-rotation source (v2.51, after scifi@v2.43):
//                runs at hour 11 UTC on Sunday, replacing stackoverflow
//                for that day. Other 6 days hour 11 still runs
//                stackoverflow. Sunday now has TWO rotation slots
//                (05 scifi + 11 parenting). Distribution rationale: Sunday
//                morning UTC = family-time energy worldwide; rotating
//                from pure-code (stackoverflow) to family-life (parenting)
//                matches the day's gestalt.
//
// Each picked topic is recorded in KV (`coverage:external:seeded:<topic>` →
// ISO timestamp) so we don't re-seed the same topic when it stays trending.
// 30-day TTL on the marker means recurring trends still get re-picked
// eventually, which is fine — re-seeding bumps used_count on the cache rows.

import { recordUsage, anthropicUsage } from '../metrics/api-use'
import { callTogether } from '../llm/together'

export type ExternalSource = 'hn' | 'wikipedia' | 'bbc' | 'arxiv' | 'github' | 'stackoverflow' | 'serverfault' | 'superuser' | 'askubuntu' | 'crossvalidated' | 'math' | 'codereview' | 'electronics' | 'security' | 'dsp' | 'ux' | 'gis' | 'biology' | 'money' | 'philosophy' | 'cooking' | 'academia' | 'diy' | 'scifi' | 'history' | 'gardening' | 'chess' | 'movies' | 'boardgames' | 'workplace' | 'parenting' | 'anime' | 'hermeneutics' | 'bicycles' | 'japanese' | 'quant' | 'linguistics' | 'rpg' | 'matheducators' | 'softwareengineering' | 'engineering' | 'politics' | 'music' | 'photo' | 'ham' | 'buddhism' | 'tex' | 'expatriates' | 'puzzling' | 'bricks' | 'ai' | 'astronomy' | 'judaism' | 'pets' | 'outdoors' | 'christianity' | 'datascience' | 'writers' | 'vegetarianism' | 'coffee' | 'travel' | 'fitness' | 'ethereum' | 'skeptics' | 'emacs' | 'mythology' | 'crafts' | 'italian' | 'russian' | 'dba' | 'cs' | 'cogsci' | 'ell' | 'economics' | 'bioinformatics' | 'cstheory' | 'sports' | 'aviation' | 'space' | 'woodworking' | 'earthscience' | 'worldbuilding' | 'poker' | 'cseducators' | 'genealogy' | 'lifehacks' | 'opensource' | 'martialarts' | 'freelancing' | 'spanish' | 'homebrew' | 'sound' | '3dprinting' | 'scicomp' | 'gaming' | 'reverseengineering' | 'literature' | 'apple' | 'android' | 'interpersonal' | 'wordpress' | 'raspberrypi' | 'graphicdesign' | 'crypto' | 'arduino' | 'drupal' | 'mathematica' | 'vi' | 'robotics' | 'magento' | 'softwarerecs' | 'retrocomputing' | 'avp' | 'sustainability' | 'tor' | 'iot' | 'musicfans' | 'pm' | 'or' | 'ebooks' | 'salesforce' | 'sharepoint' | 'tridion' | 'moderators' | 'codegolf' | 'bitcoin' | 'sitecore' | 'craftcms' | 'hsm' | 'elementaryos' | 'monero' | 'materials' | 'devops' | 'quantumcomputing' | 'gamedev' | 'chemistry' | 'networkengineering' | 'blender' | 'psychology' | 'law' | 'medicalsciences' | 'langdev' | 'drones' | 'proofassistants' | 'solana' | 'french' | 'german' | 'chinese'

export interface ExternalPick {
  source: ExternalSource
  candidates: string[]   // raw inputs (HN titles or Wikipedia article names)
  picked: string | null  // single chosen topic, lowercase, 1-4 words
  reason?: string
  fetched: number        // how many candidates we pulled before filtering
}

export interface ExternalMultiPick {
  source: ExternalSource
  candidates: string[]
  picked: string[]       // up to N distinct topics, lowercase, 1-4 words each
  reason?: string
  fetched: number
  extractor?: string     // 'haiku' (primary) or 'together:<model>' (fallback when credits empty)
}

const HN_FETCH_TIMEOUT_MS = 8000
const WIKI_FETCH_TIMEOUT_MS = 8000
const BBC_FETCH_TIMEOUT_MS = 8000
const ARXIV_FETCH_TIMEOUT_MS = 8000
const GITHUB_FETCH_TIMEOUT_MS = 8000
const SO_FETCH_TIMEOUT_MS = 8000

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// Pull top 20 HN story titles. Returns [] on any failure — caller falls through
// to the next source. We don't error: external streams are best-effort by design.
export async function fetchHNTitles(limit = 20): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      { headers: { 'User-Agent': 'nao00-bot/1.0 (+https://nao00.nchobah.com)' } },
      HN_FETCH_TIMEOUT_MS
    )
    if (!res.ok) return []
    const ids: any = await res.json()
    if (!Array.isArray(ids)) return []
    const slice = ids.slice(0, limit)
    // Fetch items in parallel — HN's firebase API handles concurrent reads fine.
    const items = await Promise.all(
      slice.map((id: number) =>
        fetchWithTimeout(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          { headers: { 'User-Agent': 'nao00-bot/1.0 (+https://nao00.nchobah.com)' } },
          HN_FETCH_TIMEOUT_MS
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    )
    return items
      .filter((i: any) => i && typeof i.title === 'string' && i.title.trim().length > 4)
      .map((i: any) => String(i.title).trim().slice(0, 200))
  } catch (_err) {
    return []
  }
}

// Wikipedia top articles for the most recent published day (UTC). The
// pageviews-top endpoint has ~36-48h publishing delay (not 24h), so we try
// t-1 first, then t-2, then t-3 — whichever returns 200 wins. Returns
// clean topic strings, filtered to drop meta-pages, redirects, and search
// artifacts.
export async function fetchWikipediaTopics(limit = 30): Promise<string[]> {
  try {
    let data: any = null
    for (const offsetDays of [1, 2, 3]) {
      const d = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000)
      const yyyy = d.getUTCFullYear()
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(d.getUTCDate()).padStart(2, '0')
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${yyyy}/${mm}/${dd}`
      const res = await fetchWithTimeout(
        url,
        { headers: { 'User-Agent': 'nao00-bot/1.0 (+https://nao00.nchobah.com)' } },
        WIKI_FETCH_TIMEOUT_MS
      )
      if (res.ok) { data = await res.json(); break }
      // 404 = data not yet published for that day; keep trying older dates
    }
    if (!data) return []
    const articles: any[] = data?.items?.[0]?.articles ?? []
    const cleaned: string[] = []
    for (const a of articles) {
      const slug = String(a?.article || '')
      // Skip meta + admin pages
      if (!slug) continue
      if (slug === 'Main_Page') continue
      if (slug.startsWith('Special:')) continue
      if (slug.startsWith('Wikipedia:')) continue
      if (slug.startsWith('File:')) continue
      if (slug.startsWith('Help:')) continue
      if (slug.startsWith('Portal:')) continue
      if (slug.startsWith('Category:')) continue
      if (slug.startsWith('Talk:')) continue
      // Skip year-of-deaths / dates noise
      if (/^Deaths_in_/i.test(slug)) continue
      if (/^List_of_/i.test(slug)) continue
      // Skip year-prefixed slugs (e.g. "2026_Tamil_Nadu_legislative_election").
      // These are too time-specific for generic factual questions; Nemotron
      // returns 0 generations on them. Burns the marker for nothing.
      if (/^\d{4}_/i.test(slug)) continue
      // Skip "Timeline_of_" / "Outline_of_" / "Index_of_" — meta articles.
      if (/^(Timeline|Outline|Index|Glossary)_of_/i.test(slug)) continue
      // Reformat: underscores → spaces, drop disambiguators "(actor)" / "(film)"
      let topic = slug.replace(/_/g, ' ').replace(/\s*\([^)]+\)\s*$/, '').trim().toLowerCase()
      // Sometimes there's URL-encoded chars
      topic = topic.replace(/%[0-9a-f]{2}/gi, ' ').replace(/\s+/g, ' ').trim()
      if (topic.length < 2 || topic.length > 60) continue
      // Cap to 4 words to match the Haiku-extracted shape
      const words = topic.split(/\s+/).filter(Boolean)
      if (words.length > 4) topic = words.slice(0, 4).join(' ')
      cleaned.push(topic)
      if (cleaned.length >= limit) break
    }
    return cleaned
  } catch (_err) {
    return []
  }
}

// Pull top BBC News headlines from the public RSS feed. Sentence-shaped, so
// caller runs them through the Haiku extractor. Returns [] on any failure.
// CDATA wrapping is stripped; HTML entities decoded for the common cases.
export async function fetchBBCHeadlines(limit = 20): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      'https://feeds.bbci.co.uk/news/rss.xml',
      { headers: { 'User-Agent': 'nao00-bot/1.0 (+https://nao00.nchobah.com)' } },
      BBC_FETCH_TIMEOUT_MS
    )
    if (!res.ok) return []
    const xml = await res.text()
    // Items look like: <item>…<title><![CDATA[Headline text]]></title>…</item>
    // Channel itself has a <title> too, so we restrict to titles inside <item>.
    const out: string[] = []
    const itemRe = /<item\b[\s\S]*?<\/item>/g
    const titleRe = /<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/
    const items = xml.match(itemRe) ?? []
    for (const it of items) {
      const m = it.match(titleRe)
      const raw = (m?.[1] ?? m?.[2] ?? '').trim()
      if (!raw) continue
      // Decode the few HTML entities BBC actually emits.
      const decoded = raw
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .trim()
      if (decoded.length < 5) continue
      out.push(decoded.slice(0, 200))
      if (out.length >= limit) break
    }
    return out
  } catch (_err) {
    return []
  }
}

// Pull recent arXiv paper titles via the public Atom API. Default categories
// span CS/AI, ML, physics, quantum, and quantitative biology — broad enough
// that the Haiku extractor sees diverse science topics (not just one field).
// Returns [] on any failure. Sentence-shaped, ready for the Haiku extractor.
export async function fetchArxivTitles(limit = 20): Promise<string[]> {
  try {
    // OR query across categories. submittedDate descending = newest papers.
    // Public endpoint, no auth, generous rate limits, but be polite (one call
    // per cron tick is well within terms).
    const cats = 'cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL+OR+cat:physics.gen-ph+OR+cat:quant-ph+OR+cat:q-bio.NC'
    const url = `https://export.arxiv.org/api/query?search_query=${cats}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`
    const res = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'nao00-bot/1.0 (+https://nao00.nchobah.com)' } },
      ARXIV_FETCH_TIMEOUT_MS
    )
    if (!res.ok) return []
    const xml = await res.text()
    // Atom: each <entry> has a <title>…</title>. Channel-level <title> is also
    // present (the feed name) — the entry titles are everything inside <entry>.
    const out: string[] = []
    const entryRe = /<entry\b[\s\S]*?<\/entry>/g
    const titleRe = /<title[^>]*>([\s\S]*?)<\/title>/
    const entries = xml.match(entryRe) ?? []
    for (const e of entries) {
      const m = e.match(titleRe)
      const raw = (m?.[1] ?? '').trim()
      if (!raw) continue
      // arXiv wraps long titles across lines with whitespace + indent. Collapse.
      const cleaned = raw
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
      if (cleaned.length < 5) continue
      out.push(cleaned.slice(0, 200))
      if (out.length >= limit) break
    }
    return out
  } catch (_err) {
    return []
  }
}

// Pull "trending" repos via GitHub's public search API: repos created in the
// last 14 days, sorted by stars descending. GitHub doesn't expose the actual
// trending page as JSON — this is the closest official approximation, and it
// favors repos that just exploded (which is exactly what we want for
// developer-build zeitgeist). Returns sentence-shaped "name - description"
// strings; the Haiku extractor distills them to topics like "vector databases"
// or "agent frameworks". Public unauth (60 req/min); we do 1/tick. [] on failure.
export async function fetchGithubTrending(limit = 20): Promise<string[]> {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10) // YYYY-MM-DD
    const q = encodeURIComponent(`created:>${since} stars:>50`)
    const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': 'nao00-bot/1.0 (+https://nao00.nchobah.com)',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      },
      GITHUB_FETCH_TIMEOUT_MS
    )
    if (!res.ok) return []
    const data: any = await res.json()
    const items: any[] = Array.isArray(data?.items) ? data.items : []
    const out: string[] = []
    for (const it of items) {
      const name = String(it?.name || '').trim()
      const desc = String(it?.description || '').trim()
      if (!name) continue
      // Sentence-shape: "name - description" so Haiku sees both repo handle and
      // its summary; description alone often misses domain (e.g. just "A fast
      // tool"), and name alone often misses meaning (e.g. just "lume").
      const line = desc ? `${name} — ${desc}` : name
      // Cap length so big READMEs spilling into description don't blow tokens.
      out.push(line.slice(0, 240))
      if (out.length >= limit) break
    }
    return out
  } catch (_err) {
    return []
  }
}

// Pull top-voted questions from any Stack Exchange site via the public REST API.
// Endpoint: api.stackexchange.com/2.3/questions?site=<site>&order=desc&sort=votes
// Returns the all-time-top questions (canonical evergreen reference Q's for the
// site's community). Sentence-shaped titles, ready for the Haiku extractor.
// Public unauth REST: 300 req/day no-key, 10K req/day with key — we use 1/tick
// per site, well under either budget even with all sites enabled.
// Returns [] on any failure. Each site = a distinct zeitgeist axis:
//   stackoverflow → programming-problem (what developers are STUCK on)
//   serverfault   → sysadmin / infrastructure (what operators are STUCK on)
//   superuser     → general computing
//   math, stats, askubuntu, … → all valid sites if we want to keep adding axes.
export async function fetchStackExchange(site: string, limit = 20): Promise<string[]> {
  try {
    // `featured=true` would prefer bountied questions but skews narrow. Default
    // sort=votes with no filter gives the canonical evergreen questions, which
    // are exactly the kind of concepts our cache should know cold for the site's domain.
    const url = `https://api.stackexchange.com/2.3/questions?order=desc&sort=votes&site=${encodeURIComponent(site)}&pagesize=${limit}&filter=default`
    const res = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'nao00-bot/1.0 (+https://nao00.nchobah.com)' } },
      SO_FETCH_TIMEOUT_MS
    )
    if (!res.ok) return []
    const data: any = await res.json()
    const items: any[] = Array.isArray(data?.items) ? data.items : []
    const out: string[] = []
    for (const it of items) {
      const raw = String(it?.title || '').trim()
      if (!raw || raw.length < 5) continue
      // SE titles are HTML-encoded (e.g. "What&#39;s the difference …"). Decode the common ones.
      const decoded = raw
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
      out.push(decoded.slice(0, 200))
      if (out.length >= limit) break
    }
    return out
  } catch (_err) {
    return []
  }
}

// Thin wrappers preserve the original API + give each axis a discoverable name.
export async function fetchStackOverflow(limit = 20): Promise<string[]> {
  return fetchStackExchange('stackoverflow', limit)
}
export async function fetchServerFault(limit = 20): Promise<string[]> {
  return fetchStackExchange('serverfault', limit)
}
export async function fetchSuperUser(limit = 20): Promise<string[]> {
  return fetchStackExchange('superuser', limit)
}
export async function fetchAskUbuntu(limit = 20): Promise<string[]> {
  return fetchStackExchange('askubuntu', limit)
}
export async function fetchCrossValidated(limit = 20): Promise<string[]> {
  // Cross Validated lives at stats.stackexchange.com — site key is "stats".
  return fetchStackExchange('stats', limit)
}
export async function fetchMath(limit = 20): Promise<string[]> {
  // Mathematics SE lives at math.stackexchange.com — site key is "math".
  return fetchStackExchange('math', limit)
}
export async function fetchCodeReview(limit = 20): Promise<string[]> {
  // Code Review SE lives at codereview.stackexchange.com — site key is "codereview".
  return fetchStackExchange('codereview', limit)
}
export async function fetchElectronics(limit = 20): Promise<string[]> {
  // Electrical Engineering SE lives at electronics.stackexchange.com — site key is "electronics".
  return fetchStackExchange('electronics', limit)
}
export async function fetchSecurity(limit = 20): Promise<string[]> {
  // Information Security SE lives at security.stackexchange.com — site key is "security".
  return fetchStackExchange('security', limit)
}
export async function fetchDsp(limit = 20): Promise<string[]> {
  // Signal Processing SE lives at dsp.stackexchange.com — site key is "dsp".
  return fetchStackExchange('dsp', limit)
}
export async function fetchUx(limit = 20): Promise<string[]> {
  // User Experience SE lives at ux.stackexchange.com — site key is "ux".
  return fetchStackExchange('ux', limit)
}
export async function fetchGis(limit = 20): Promise<string[]> {
  // Geographic Information Systems SE lives at gis.stackexchange.com — site key is "gis".
  return fetchStackExchange('gis', limit)
}
export async function fetchBiology(limit = 20): Promise<string[]> {
  // Biology SE lives at biology.stackexchange.com — site key is "biology".
  return fetchStackExchange('biology', limit)
}
export async function fetchMoney(limit = 20): Promise<string[]> {
  // Personal Finance & Money SE lives at money.stackexchange.com — site key is "money".
  return fetchStackExchange('money', limit)
}
export async function fetchPhilosophy(limit = 20): Promise<string[]> {
  // Philosophy SE lives at philosophy.stackexchange.com — site key is "philosophy".
  return fetchStackExchange('philosophy', limit)
}
export async function fetchCooking(limit = 20): Promise<string[]> {
  // Seasoned Advice (Cooking SE) lives at cooking.stackexchange.com — site key is "cooking".
  return fetchStackExchange('cooking', limit)
}
export async function fetchAcademia(limit = 20): Promise<string[]> {
  // Academia SE lives at academia.stackexchange.com — site key is "academia".
  return fetchStackExchange('academia', limit)
}
export async function fetchDiy(limit = 20): Promise<string[]> {
  // Home Improvement SE lives at diy.stackexchange.com — site key is "diy".
  return fetchStackExchange('diy', limit)
}
export async function fetchScifi(limit = 20): Promise<string[]> {
  // Science Fiction & Fantasy SE lives at scifi.stackexchange.com — site key is "scifi".
  return fetchStackExchange('scifi', limit)
}
export async function fetchHistory(limit = 20): Promise<string[]> {
  // History SE lives at history.stackexchange.com — site key is "history".
  return fetchStackExchange('history', limit)
}
export async function fetchGardening(limit = 20): Promise<string[]> {
  // Gardening & Landscaping SE lives at gardening.stackexchange.com — site key is "gardening".
  return fetchStackExchange('gardening', limit)
}
export async function fetchChess(limit = 20): Promise<string[]> {
  // Chess SE lives at chess.stackexchange.com — site key is "chess".
  return fetchStackExchange('chess', limit)
}
export async function fetchMovies(limit = 20): Promise<string[]> {
  // Movies & TV SE lives at movies.stackexchange.com — site key is "movies".
  return fetchStackExchange('movies', limit)
}
export async function fetchBoardgames(limit = 20): Promise<string[]> {
  // Board & Card Games SE lives at boardgames.stackexchange.com — site key is "boardgames".
  return fetchStackExchange('boardgames', limit)
}
export async function fetchWorkplace(limit = 20): Promise<string[]> {
  // The Workplace SE lives at workplace.stackexchange.com — site key is "workplace".
  return fetchStackExchange('workplace', limit)
}
export async function fetchParenting(limit = 20): Promise<string[]> {
  // Parenting SE lives at parenting.stackexchange.com — site key is "parenting".
  return fetchStackExchange('parenting', limit)
}
export async function fetchAnime(limit = 20): Promise<string[]> {
  // Anime & Manga SE lives at anime.stackexchange.com — site key is "anime".
  return fetchStackExchange('anime', limit)
}
export async function fetchHermeneutics(limit = 20): Promise<string[]> {
  // Biblical Hermeneutics SE lives at hermeneutics.stackexchange.com — site key is "hermeneutics".
  return fetchStackExchange('hermeneutics', limit)
}
export async function fetchBicycles(limit = 20): Promise<string[]> {
  // Bicycles SE lives at bicycles.stackexchange.com — site key is "bicycles".
  return fetchStackExchange('bicycles', limit)
}
export async function fetchJapanese(limit = 20): Promise<string[]> {
  // Japanese Language SE lives at japanese.stackexchange.com — site key is "japanese".
  return fetchStackExchange('japanese', limit)
}
export async function fetchQuant(limit = 20): Promise<string[]> {
  // Quantitative Finance SE lives at quant.stackexchange.com — site key is "quant".
  return fetchStackExchange('quant', limit)
}
export async function fetchLinguistics(limit = 20): Promise<string[]> {
  // Linguistics SE lives at linguistics.stackexchange.com — site key is "linguistics".
  return fetchStackExchange('linguistics', limit)
}
export async function fetchRpg(limit = 20): Promise<string[]> {
  // Role-playing Games SE lives at rpg.stackexchange.com — site key is "rpg".
  return fetchStackExchange('rpg', limit)
}
export async function fetchMatheducators(limit = 20): Promise<string[]> {
  // Mathematics Educators SE lives at matheducators.stackexchange.com — site key is "matheducators".
  return fetchStackExchange('matheducators', limit)
}
export async function fetchSoftwareengineering(limit = 20): Promise<string[]> {
  // Software Engineering SE lives at softwareengineering.stackexchange.com — site key is "softwareengineering".
  return fetchStackExchange('softwareengineering', limit)
}
export async function fetchEngineering(limit = 20): Promise<string[]> {
  // Engineering SE lives at engineering.stackexchange.com — site key is "engineering".
  return fetchStackExchange('engineering', limit)
}
export async function fetchPolitics(limit = 20): Promise<string[]> {
  // Politics SE lives at politics.stackexchange.com — site key is "politics".
  return fetchStackExchange('politics', limit)
}
export async function fetchMusic(limit = 20): Promise<string[]> {
  // Music: Practice & Theory SE lives at music.stackexchange.com — site key is "music".
  return fetchStackExchange('music', limit)
}
export async function fetchPhoto(limit = 20): Promise<string[]> {
  // Photography SE lives at photo.stackexchange.com — site key is "photo".
  return fetchStackExchange('photo', limit)
}
export async function fetchHam(limit = 20): Promise<string[]> {
  // Amateur Radio SE lives at ham.stackexchange.com — site key is "ham".
  return fetchStackExchange('ham', limit)
}
export async function fetchBuddhism(limit = 20): Promise<string[]> {
  // Buddhism SE lives at buddhism.stackexchange.com — site key is "buddhism".
  return fetchStackExchange('buddhism', limit)
}
export async function fetchTex(limit = 20): Promise<string[]> {
  // TeX - LaTeX SE lives at tex.stackexchange.com — site key is "tex".
  return fetchStackExchange('tex', limit)
}
export async function fetchExpatriates(limit = 20): Promise<string[]> {
  // Expatriates SE lives at expatriates.stackexchange.com — site key is "expatriates".
  return fetchStackExchange('expatriates', limit)
}
export async function fetchPuzzling(limit = 20): Promise<string[]> {
  // Puzzling SE lives at puzzling.stackexchange.com — site key is "puzzling".
  return fetchStackExchange('puzzling', limit)
}
export async function fetchBricks(limit = 20): Promise<string[]> {
  // Bricks (LEGO) SE lives at bricks.stackexchange.com — site key is "bricks".
  return fetchStackExchange('bricks', limit)
}
export async function fetchAi(limit = 20): Promise<string[]> {
  // Artificial Intelligence SE lives at ai.stackexchange.com — site key is "ai".
  return fetchStackExchange('ai', limit)
}
export async function fetchAstronomy(limit = 20): Promise<string[]> {
  // Astronomy SE lives at astronomy.stackexchange.com — site key is "astronomy".
  return fetchStackExchange('astronomy', limit)
}
export async function fetchJudaism(limit = 20): Promise<string[]> {
  // Mi Yodeya (Judaism) SE lives at judaism.stackexchange.com — site key is "judaism".
  return fetchStackExchange('judaism', limit)
}
export async function fetchPets(limit = 20): Promise<string[]> {
  // Pets SE lives at pets.stackexchange.com — site key is "pets".
  return fetchStackExchange('pets', limit)
}
export async function fetchOutdoors(limit = 20): Promise<string[]> {
  // The Great Outdoors SE lives at outdoors.stackexchange.com — site key is "outdoors".
  return fetchStackExchange('outdoors', limit)
}
export async function fetchChristianity(limit = 20): Promise<string[]> {
  // Christianity SE lives at christianity.stackexchange.com — site key is "christianity".
  return fetchStackExchange('christianity', limit)
}
export async function fetchDatascience(limit = 20): Promise<string[]> {
  // Data Science SE lives at datascience.stackexchange.com — site key is "datascience".
  return fetchStackExchange('datascience', limit)
}
export async function fetchWriters(limit = 20): Promise<string[]> {
  // Writing SE (a.k.a. Writers SE) lives at writing.stackexchange.com — site key is "writing".
  return fetchStackExchange('writing', limit)
}
export async function fetchVegetarianism(limit = 20): Promise<string[]> {
  // Vegetarianism SE lives at vegetarianism.stackexchange.com — site key is "vegetarianism".
  return fetchStackExchange('vegetarianism', limit)
}
export async function fetchCoffee(limit = 20): Promise<string[]> {
  // Coffee SE lives at coffee.stackexchange.com — site key is "coffee".
  return fetchStackExchange('coffee', limit)
}
export async function fetchTravel(limit = 20): Promise<string[]> {
  // Travel SE lives at travel.stackexchange.com — site key is "travel".
  return fetchStackExchange('travel', limit)
}
export async function fetchFitness(limit = 20): Promise<string[]> {
  // Physical Fitness SE lives at fitness.stackexchange.com — site key is "fitness".
  return fetchStackExchange('fitness', limit)
}
export async function fetchEthereum(limit = 20): Promise<string[]> {
  // Ethereum SE lives at ethereum.stackexchange.com — site key is "ethereum".
  return fetchStackExchange('ethereum', limit)
}
export async function fetchSkeptics(limit = 20): Promise<string[]> {
  // Skeptics SE lives at skeptics.stackexchange.com — site key is "skeptics".
  return fetchStackExchange('skeptics', limit)
}
export async function fetchEmacs(limit = 20): Promise<string[]> {
  // Emacs SE lives at emacs.stackexchange.com — site key is "emacs".
  return fetchStackExchange('emacs', limit)
}
export async function fetchMythology(limit = 20): Promise<string[]> {
  // Mythology SE lives at mythology.stackexchange.com — site key is "mythology".
  return fetchStackExchange('mythology', limit)
}
export async function fetchCrafts(limit = 20): Promise<string[]> {
  // Crafts SE lives at crafts.stackexchange.com — site key is "crafts".
  return fetchStackExchange('crafts', limit)
}
export async function fetchItalian(limit = 20): Promise<string[]> {
  // Italian Language SE lives at italian.stackexchange.com — site key is "italian".
  return fetchStackExchange('italian', limit)
}
export async function fetchRussian(limit = 20): Promise<string[]> {
  // Russian Language SE lives at russian.stackexchange.com — site key is "russian".
  return fetchStackExchange('russian', limit)
}
export async function fetchDba(limit = 20): Promise<string[]> {
  // Database Administrators SE lives at dba.stackexchange.com — site key is "dba".
  return fetchStackExchange('dba', limit)
}
export async function fetchCs(limit = 20): Promise<string[]> {
  // Computer Science SE lives at cs.stackexchange.com — site key is "cs".
  return fetchStackExchange('cs', limit)
}
export async function fetchCogsci(limit = 20): Promise<string[]> {
  // Cognitive Sciences SE lives at cogsci.stackexchange.com — site key is "cogsci".
  return fetchStackExchange('cogsci', limit)
}
export async function fetchEll(limit = 20): Promise<string[]> {
  // English Language Learners SE lives at ell.stackexchange.com — site key is "ell".
  return fetchStackExchange('ell', limit)
}
export async function fetchEconomics(limit = 20): Promise<string[]> {
  // Economics SE lives at economics.stackexchange.com — site key is "economics".
  return fetchStackExchange('economics', limit)
}
export async function fetchBioinformatics(limit = 20): Promise<string[]> {
  // Bioinformatics SE lives at bioinformatics.stackexchange.com — site key is "bioinformatics".
  return fetchStackExchange('bioinformatics', limit)
}
export async function fetchCstheory(limit = 20): Promise<string[]> {
  // Theoretical Computer Science SE lives at cstheory.stackexchange.com — site key is "cstheory".
  return fetchStackExchange('cstheory', limit)
}
export async function fetchSports(limit = 20): Promise<string[]> {
  // Sports SE lives at sports.stackexchange.com — site key is "sports".
  return fetchStackExchange('sports', limit)
}
export async function fetchAviation(limit = 20): Promise<string[]> {
  // Aviation SE lives at aviation.stackexchange.com — site key is "aviation".
  return fetchStackExchange('aviation', limit)
}
export async function fetchSpace(limit = 20): Promise<string[]> {
  // Space Exploration SE lives at space.stackexchange.com — site key is "space".
  return fetchStackExchange('space', limit)
}
export async function fetchWoodworking(limit = 20): Promise<string[]> {
  // Woodworking SE lives at woodworking.stackexchange.com — site key is "woodworking".
  return fetchStackExchange('woodworking', limit)
}
export async function fetchEarthscience(limit = 20): Promise<string[]> {
  // Earth Science SE lives at earthscience.stackexchange.com — site key is "earthscience".
  return fetchStackExchange('earthscience', limit)
}
export async function fetchWorldbuilding(limit = 20): Promise<string[]> {
  // Worldbuilding SE lives at worldbuilding.stackexchange.com — site key is "worldbuilding".
  return fetchStackExchange('worldbuilding', limit)
}
export async function fetchPoker(limit = 20): Promise<string[]> {
  // Poker SE lives at poker.stackexchange.com — site key is "poker".
  return fetchStackExchange('poker', limit)
}
export async function fetchCseducators(limit = 20): Promise<string[]> {
  // CS Educators SE lives at cseducators.stackexchange.com — site key is "cseducators".
  return fetchStackExchange('cseducators', limit)
}
export async function fetchGenealogy(limit = 20): Promise<string[]> {
  // Genealogy & Family History SE lives at genealogy.stackexchange.com — site key is "genealogy".
  return fetchStackExchange('genealogy', limit)
}
export async function fetchLifehacks(limit = 20): Promise<string[]> {
  // Lifehacks SE lives at lifehacks.stackexchange.com — site key is "lifehacks".
  return fetchStackExchange('lifehacks', limit)
}
export async function fetchOpensource(limit = 20): Promise<string[]> {
  // Open Source SE lives at opensource.stackexchange.com — site key is "opensource".
  return fetchStackExchange('opensource', limit)
}
export async function fetchMartialarts(limit = 20): Promise<string[]> {
  // Martial Arts SE lives at martialarts.stackexchange.com — site key is "martialarts".
  return fetchStackExchange('martialarts', limit)
}
export async function fetchFreelancing(limit = 20): Promise<string[]> {
  // Freelancing SE lives at freelancing.stackexchange.com — site key is "freelancing".
  return fetchStackExchange('freelancing', limit)
}
export async function fetchSpanish(limit = 20): Promise<string[]> {
  // Spanish Language SE lives at spanish.stackexchange.com — site key is "spanish".
  return fetchStackExchange('spanish', limit)
}
export async function fetchHomebrew(limit = 20): Promise<string[]> {
  // Homebrewing SE lives at homebrew.stackexchange.com — site key is "homebrew".
  return fetchStackExchange('homebrew', limit)
}
export async function fetchSound(limit = 20): Promise<string[]> {
  // Sound Design SE lives at sound.stackexchange.com — site key is "sound".
  return fetchStackExchange('sound', limit)
}
export async function fetch3dprinting(limit = 20): Promise<string[]> {
  // 3D Printing SE lives at 3dprinting.stackexchange.com — site key is "3dprinting".
  return fetchStackExchange('3dprinting', limit)
}
export async function fetchScicomp(limit = 20): Promise<string[]> {
  // Computational Science SE lives at scicomp.stackexchange.com — site key is "scicomp".
  return fetchStackExchange('scicomp', limit)
}
export async function fetchGaming(limit = 20): Promise<string[]> {
  // Arqade/Gaming SE lives at gaming.stackexchange.com — site key is "gaming".
  return fetchStackExchange('gaming', limit)
}
export async function fetchReverseengineering(limit = 20): Promise<string[]> {
  // Reverse Engineering SE lives at reverseengineering.stackexchange.com — site key is "reverseengineering".
  return fetchStackExchange('reverseengineering', limit)
}
export async function fetchLiterature(limit = 20): Promise<string[]> {
  // Literature SE lives at literature.stackexchange.com — site key is "literature".
  return fetchStackExchange('literature', limit)
}
export async function fetchApple(limit = 20): Promise<string[]> {
  // Ask Different (Apple) SE lives at apple.stackexchange.com — site key is "apple".
  return fetchStackExchange('apple', limit)
}
export async function fetchAndroid(limit = 20): Promise<string[]> {
  // Android Enthusiasts SE lives at android.stackexchange.com — site key is "android".
  return fetchStackExchange('android', limit)
}
export async function fetchInterpersonal(limit = 20): Promise<string[]> {
  // Interpersonal Skills SE lives at interpersonal.stackexchange.com — site key is "interpersonal".
  return fetchStackExchange('interpersonal', limit)
}
export async function fetchWordpress(limit = 20): Promise<string[]> {
  // WordPress Development SE lives at wordpress.stackexchange.com — site key is "wordpress".
  return fetchStackExchange('wordpress', limit)
}
export async function fetchRaspberrypi(limit = 20): Promise<string[]> {
  // Raspberry Pi SE lives at raspberrypi.stackexchange.com — site key is "raspberrypi".
  return fetchStackExchange('raspberrypi', limit)
}
export async function fetchGraphicdesign(limit = 20): Promise<string[]> {
  // Graphic Design SE lives at graphicdesign.stackexchange.com — site key is "graphicdesign".
  return fetchStackExchange('graphicdesign', limit)
}
export async function fetchCrypto(limit = 20): Promise<string[]> {
  // Cryptography SE lives at crypto.stackexchange.com — site key is "crypto".
  return fetchStackExchange('crypto', limit)
}
export async function fetchArduino(limit = 20): Promise<string[]> {
  // Arduino SE lives at arduino.stackexchange.com — site key is "arduino".
  return fetchStackExchange('arduino', limit)
}
export async function fetchDrupal(limit = 20): Promise<string[]> {
  // Drupal Answers SE lives at drupal.stackexchange.com — site key is "drupal".
  return fetchStackExchange('drupal', limit)
}
export async function fetchMathematica(limit = 20): Promise<string[]> {
  // Mathematica SE lives at mathematica.stackexchange.com — site key is "mathematica".
  return fetchStackExchange('mathematica', limit)
}
export async function fetchVi(limit = 20): Promise<string[]> {
  // Vi/Vim SE lives at vi.stackexchange.com — site key is "vi".
  return fetchStackExchange('vi', limit)
}
export async function fetchRobotics(limit = 20): Promise<string[]> {
  // Robotics SE lives at robotics.stackexchange.com — site key is "robotics".
  return fetchStackExchange('robotics', limit)
}
export async function fetchMagento(limit = 20): Promise<string[]> {
  // Magento SE lives at magento.stackexchange.com — site key is "magento".
  return fetchStackExchange('magento', limit)
}
export async function fetchSoftwarerecs(limit = 20): Promise<string[]> {
  // Software Recommendations SE lives at softwarerecs.stackexchange.com — site key is "softwarerecs".
  return fetchStackExchange('softwarerecs', limit)
}
export async function fetchRetrocomputing(limit = 20): Promise<string[]> {
  // Retrocomputing SE lives at retrocomputing.stackexchange.com — site key is "retrocomputing".
  return fetchStackExchange('retrocomputing', limit)
}
export async function fetchAvp(limit = 20): Promise<string[]> {
  // Audio/Video Production SE lives at avp.stackexchange.com — site key is "avp".
  return fetchStackExchange('avp', limit)
}
export async function fetchSustainability(limit = 20): Promise<string[]> {
  // Sustainable Living SE lives at sustainability.stackexchange.com — site key is "sustainability".
  return fetchStackExchange('sustainability', limit)
}
export async function fetchTor(limit = 20): Promise<string[]> {
  // Tor SE lives at tor.stackexchange.com — site key is "tor".
  return fetchStackExchange('tor', limit)
}
export async function fetchIot(limit = 20): Promise<string[]> {
  // Internet of Things SE lives at iot.stackexchange.com — site key is "iot".
  return fetchStackExchange('iot', limit)
}
export async function fetchMusicfans(limit = 20): Promise<string[]> {
  // Music Fans SE lives at musicfans.stackexchange.com — site key is "musicfans".
  return fetchStackExchange('musicfans', limit)
}
export async function fetchPm(limit = 20): Promise<string[]> {
  // Project Management SE lives at pm.stackexchange.com — site key is "pm".
  return fetchStackExchange('pm', limit)
}
export async function fetchOr(limit = 20): Promise<string[]> {
  // Operations Research SE lives at or.stackexchange.com — site key is "or".
  return fetchStackExchange('or', limit)
}
export async function fetchEbooks(limit = 20): Promise<string[]> {
  // Ebooks SE lives at ebooks.stackexchange.com — site key is "ebooks".
  return fetchStackExchange('ebooks', limit)
}
export async function fetchSalesforce(limit = 20): Promise<string[]> {
  // Salesforce SE lives at salesforce.stackexchange.com — site key is "salesforce".
  return fetchStackExchange('salesforce', limit)
}
export async function fetchSharepoint(limit = 20): Promise<string[]> {
  // SharePoint SE lives at sharepoint.stackexchange.com — site key is "sharepoint".
  return fetchStackExchange('sharepoint', limit)
}
export async function fetchTridion(limit = 20): Promise<string[]> {
  // Tridion SE lives at tridion.stackexchange.com — site key is "tridion".
  return fetchStackExchange('tridion', limit)
}
export async function fetchModerators(limit = 20): Promise<string[]> {
  // Moderators SE lives at moderators.stackexchange.com — site key is "moderators".
  return fetchStackExchange('moderators', limit)
}
export async function fetchCodegolf(limit = 20): Promise<string[]> {
  // Code Golf SE lives at codegolf.stackexchange.com — site key is "codegolf".
  return fetchStackExchange('codegolf', limit)
}
export async function fetchBitcoin(limit = 20): Promise<string[]> {
  // Bitcoin SE lives at bitcoin.stackexchange.com — site key is "bitcoin".
  return fetchStackExchange('bitcoin', limit)
}
export async function fetchSitecore(limit = 20): Promise<string[]> {
  // Sitecore SE lives at sitecore.stackexchange.com — site key is "sitecore".
  return fetchStackExchange('sitecore', limit)
}
export async function fetchCraftcms(limit = 20): Promise<string[]> {
  // Craft CMS SE lives at craftcms.stackexchange.com — site key is "craftcms".
  return fetchStackExchange('craftcms', limit)
}
export async function fetchHsm(limit = 20): Promise<string[]> {
  // History of Science and Mathematics SE — site key is "hsm" (NOT Hardware Security Modules).
  return fetchStackExchange('hsm', limit)
}
export async function fetchElementaryos(limit = 20): Promise<string[]> {
  // Elementary OS SE — site key is "elementaryos".
  return fetchStackExchange('elementaryos', limit)
}
export async function fetchMonero(limit = 20): Promise<string[]> {
  // Monero SE — site key is "monero".
  return fetchStackExchange('monero', limit)
}
export async function fetchMaterials(limit = 20): Promise<string[]> {
  // Materials Science SE — site key is "materials".
  return fetchStackExchange('materials', limit)
}
export async function fetchDevops(limit = 20): Promise<string[]> {
  // DevOps SE — site key is "devops".
  return fetchStackExchange('devops', limit)
}
export async function fetchQuantumcomputing(limit = 20): Promise<string[]> {
  // Quantum Computing SE — site key is "quantumcomputing".
  return fetchStackExchange('quantumcomputing', limit)
}
export async function fetchGamedev(limit = 20): Promise<string[]> {
  // Game Development SE — site key is "gamedev".
  return fetchStackExchange('gamedev', limit)
}
export async function fetchChemistry(limit = 20): Promise<string[]> {
  // Chemistry SE — site key is "chemistry".
  return fetchStackExchange('chemistry', limit)
}
export async function fetchNetworkengineering(limit = 20): Promise<string[]> {
  // Network Engineering SE — site key is "networkengineering".
  return fetchStackExchange('networkengineering', limit)
}
export async function fetchBlender(limit = 20): Promise<string[]> {
  // Blender SE — site key is "blender".
  return fetchStackExchange('blender', limit)
}
export async function fetchPsychology(limit = 20): Promise<string[]> {
  // Psychology & Neuroscience SE — site key is "psychology".
  return fetchStackExchange('psychology', limit)
}
export async function fetchLaw(limit = 20): Promise<string[]> {
  // Law SE — site key is "law".
  return fetchStackExchange('law', limit)
}
export async function fetchMedicalsciences(limit = 20): Promise<string[]> {
  // Medical Sciences SE — site key is "medicalsciences".
  return fetchStackExchange('medicalsciences', limit)
}
export async function fetchLangdev(limit = 20): Promise<string[]> {
  // Programming Language Design and Implementation SE — site key is "langdev".
  return fetchStackExchange('langdev', limit)
}
export async function fetchDrones(limit = 20): Promise<string[]> {
  // Drones and Model Aircraft SE — site key is "drones".
  return fetchStackExchange('drones', limit)
}
export async function fetchProofassistants(limit = 20): Promise<string[]> {
  // Proof Assistants SE — site key is "proofassistants".
  return fetchStackExchange('proofassistants', limit)
}
export async function fetchSolana(limit = 20): Promise<string[]> {
  // Solana SE — site key is "solana".
  return fetchStackExchange('solana', limit)
}
export async function fetchFrench(limit = 20): Promise<string[]> {
  // French Language SE — site key is "french".
  return fetchStackExchange('french', limit)
}
export async function fetchGerman(limit = 20): Promise<string[]> {
  // German Language SE — site key is "german".
  return fetchStackExchange('german', limit)
}
export async function fetchChinese(limit = 20): Promise<string[]> {
  // Chinese Language SE — site key is "chinese".
  return fetchStackExchange('chinese', limit)
}

// ---------------------------------------------------------------------------
// Source registries (v2.33 refactor) — adding source N+1 is now a one-line
// change in each registry plus one hour-window in auto_coverage.ts. Replaces
// the giant nested ternary in pickExternalTopics and the 11-clause concatenated
// system prompt in extractTopicsFromTitles. Behavior is byte-identical to v2.32
// (clauses joined in registry-iteration order) — this is purely an internal
// reshape so the next 5+ sources don't bloat the prompt or the dispatch.
// ---------------------------------------------------------------------------

// Cycle ring for the auto-coverage retry loop. Keep ordered by UTC hour-window
// (matches externalSourceForHour) so the cycle cleanly walks the day.
export const EXTERNAL_SOURCES: readonly ExternalSource[] = [
  'cooking', 'academia', 'judaism', 'christianity', 'datascience', 'history', 'arxiv', 'money', 'quant', 'diy', 'scifi', 'askubuntu', 'pets', 'workplace', 'vegetarianism', 'coffee', 'security', 'github', 'math', 'matheducators', 'dsp',
  'stackoverflow', 'travel', 'expatriates', 'parenting', 'music', 'ux', 'puzzling', 'bricks', 'chess', 'hn', 'boardgames', 'anime', 'ai', 'gis', 'astronomy', 'outdoors', 'bicycles', 'crossvalidated', 'japanese', 'linguistics', 'serverfault',
  'codereview', 'tex', 'softwareengineering', 'movies', 'fitness', 'wikipedia', 'photo', 'biology', 'buddhism', 'gardening', 'philosophy', 'hermeneutics', 'superuser', 'rpg', 'writers',
  'electronics', 'engineering', 'ham', 'bbc', 'politics',
  'ethereum', 'skeptics', 'emacs', 'mythology', 'crafts', 'italian',
  'russian', 'dba', 'cs', 'cogsci',
  'ell', 'economics', 'bioinformatics', 'cstheory',
  'sports', 'aviation', 'space', 'woodworking',
  'earthscience', 'worldbuilding', 'poker',
  'cseducators', 'genealogy', 'lifehacks',
  'opensource',
  'martialarts', 'freelancing',
  'spanish', 'homebrew', 'sound', '3dprinting',
  'scicomp', 'gaming', 'reverseengineering', 'literature',
  'apple', 'android', 'interpersonal',
  'wordpress', 'raspberrypi', 'graphicdesign', 'crypto',
  'arduino', 'drupal', 'mathematica',
  'vi', 'robotics', 'magento', 'softwarerecs',
  'retrocomputing', 'avp', 'sustainability',
  'tor', 'iot', 'musicfans', 'pm',
  'or', 'ebooks', 'salesforce',
  'sharepoint', 'tridion', 'moderators', 'codegolf',
  'bitcoin', 'sitecore', 'craftcms',
  'hsm', 'elementaryos', 'monero', 'materials',
  'devops', 'quantumcomputing', 'gamedev',
  'chemistry', 'networkengineering', 'blender', 'psychology',
  'law', 'medicalsciences', 'langdev',
  'drones', 'proofassistants', 'solana', 'french',
  'german', 'chinese',
] as const

// Fetcher dispatch — `await SOURCE_FETCHERS[source](20)` collapses what used
// to be a 13-arm ternary. Wikipedia stays in the registry for completeness
// even though pickExternalTopics short-circuits it (slug-based, no Haiku).
export const SOURCE_FETCHERS: Record<ExternalSource, (limit?: number) => Promise<string[]>> = {
  hn: fetchHNTitles,
  wikipedia: fetchWikipediaTopics,
  bbc: fetchBBCHeadlines,
  arxiv: fetchArxivTitles,
  github: fetchGithubTrending,
  stackoverflow: fetchStackOverflow,
  serverfault: fetchServerFault,
  superuser: fetchSuperUser,
  askubuntu: fetchAskUbuntu,
  crossvalidated: fetchCrossValidated,
  math: fetchMath,
  codereview: fetchCodeReview,
  electronics: fetchElectronics,
  security: fetchSecurity,
  dsp: fetchDsp,
  ux: fetchUx,
  gis: fetchGis,
  biology: fetchBiology,
  money: fetchMoney,
  philosophy: fetchPhilosophy,
  cooking: fetchCooking,
  academia: fetchAcademia,
  diy: fetchDiy,
  scifi: fetchScifi,
  history: fetchHistory,
  gardening: fetchGardening,
  chess: fetchChess,
  movies: fetchMovies,
  boardgames: fetchBoardgames,
  workplace: fetchWorkplace,
  parenting: fetchParenting,
  anime: fetchAnime,
  hermeneutics: fetchHermeneutics,
  bicycles: fetchBicycles,
  japanese: fetchJapanese,
  quant: fetchQuant,
  linguistics: fetchLinguistics,
  rpg: fetchRpg,
  matheducators: fetchMatheducators,
  softwareengineering: fetchSoftwareengineering,
  engineering: fetchEngineering,
  politics: fetchPolitics,
  music: fetchMusic,
  photo: fetchPhoto,
  ham: fetchHam,
  buddhism: fetchBuddhism,
  tex: fetchTex,
  expatriates: fetchExpatriates,
  puzzling: fetchPuzzling,
  bricks: fetchBricks,
  ai: fetchAi,
  astronomy: fetchAstronomy,
  judaism: fetchJudaism,
  pets: fetchPets,
  outdoors: fetchOutdoors,
  christianity: fetchChristianity,
  datascience: fetchDatascience,
  writers: fetchWriters,
  vegetarianism: fetchVegetarianism,
  coffee: fetchCoffee,
  travel: fetchTravel,
  fitness: fetchFitness,
  ethereum: fetchEthereum,
  skeptics: fetchSkeptics,
  emacs: fetchEmacs,
  mythology: fetchMythology,
  crafts: fetchCrafts,
  italian: fetchItalian,
  russian: fetchRussian,
  dba: fetchDba,
  cs: fetchCs,
  cogsci: fetchCogsci,
  ell: fetchEll,
  economics: fetchEconomics,
  bioinformatics: fetchBioinformatics,
  cstheory: fetchCstheory,
  sports: fetchSports,
  aviation: fetchAviation,
  space: fetchSpace,
  woodworking: fetchWoodworking,
  earthscience: fetchEarthscience,
  worldbuilding: fetchWorldbuilding,
  poker: fetchPoker,
  cseducators: fetchCseducators,
  genealogy: fetchGenealogy,
  lifehacks: fetchLifehacks,
  opensource: fetchOpensource,
  martialarts: fetchMartialarts,
  freelancing: fetchFreelancing,
  spanish: fetchSpanish,
  homebrew: fetchHomebrew,
  sound: fetchSound,
  '3dprinting': fetch3dprinting,
  scicomp: fetchScicomp,
  gaming: fetchGaming,
  reverseengineering: fetchReverseengineering,
  literature: fetchLiterature,
  apple: fetchApple,
  android: fetchAndroid,
  interpersonal: fetchInterpersonal,
  wordpress: fetchWordpress,
  raspberrypi: fetchRaspberrypi,
  graphicdesign: fetchGraphicdesign,
  crypto: fetchCrypto,
  arduino: fetchArduino,
  drupal: fetchDrupal,
  mathematica: fetchMathematica,
  vi: fetchVi,
  robotics: fetchRobotics,
  magento: fetchMagento,
  softwarerecs: fetchSoftwarerecs,
  retrocomputing: fetchRetrocomputing,
  avp: fetchAvp,
  sustainability: fetchSustainability,
  tor: fetchTor,
  iot: fetchIot,
  musicfans: fetchMusicfans,
  pm: fetchPm,
  or: fetchOr,
  ebooks: fetchEbooks,
  salesforce: fetchSalesforce,
  sharepoint: fetchSharepoint,
  tridion: fetchTridion,
  moderators: fetchModerators,
  codegolf: fetchCodegolf,
  bitcoin: fetchBitcoin,
  sitecore: fetchSitecore,
  craftcms: fetchCraftcms,
  hsm: fetchHsm,
  elementaryos: fetchElementaryos,
  monero: fetchMonero,
  materials: fetchMaterials,
  devops: fetchDevops,
  quantumcomputing: fetchQuantumcomputing,
  gamedev: fetchGamedev,
  chemistry: fetchChemistry,
  networkengineering: fetchNetworkengineering,
  blender: fetchBlender,
  psychology: fetchPsychology,
  law: fetchLaw,
  medicalsciences: fetchMedicalsciences,
  langdev: fetchLangdev,
  drones: fetchDrones,
  proofassistants: fetchProofassistants,
  solana: fetchSolana,
  french: fetchFrench,
  german: fetchGerman,
  chinese: fetchChinese,
}

// Per-source Haiku input-shape clause. Empty string = source's titles are
// already topic-shaped (wikipedia slugs) or content-domain-clear (bbc headlines,
// hn titles) so no special distillation guidance is needed. Insertion order
// matches the v2.32 hand-built prompt (introduction order: arxiv → github →
// SO → SF → SU → AU → CV → math → CR → electronics → security) so
// `buildSystemPrompt()` produces a BYTE-IDENTICAL string. Verified
// programmatically before deploy.
const SOURCE_CLAUSES: Record<ExternalSource, string> = {
  // No-clause sources first (filtered out at concat time, position is moot).
  hn: '',
  wikipedia: '',
  bbc: '',
  // Distillation clauses, in v2.32 introduction order.
  arxiv:
    'If the input looks academic, distill to the underlying field (e.g. "language model ' +
    'evaluation", "associative memory", "in-context learning", "chain of thought reasoning", ' +
    '"retrieval augmented generation", "sparse attention", "mixture of experts", "model ' +
    'distillation", "parameter efficient fine tuning", "low rank adaptation", "instruction ' +
    'tuning", "rlhf alignment", "constitutional ai", "mechanistic interpretability", "sparse ' +
    'autoencoders", "circuit analysis transformers", "scaling laws", "emergent capabilities", ' +
    '"jailbreak robustness", "prompt injection defense", "self consistency decoding", "tree ' +
    'of thoughts", "react agent loop", "tool use language models", "function calling models", ' +
    '"speculative decoding", "kv cache compression", "flash attention", "rotary position ' +
    'embedding", "swiglu activation", "layer normalization", "transformer architecture", ' +
    '"mamba state space models", "diffusion transformers", "classifier free guidance", ' +
    '"latent diffusion", "denoising score matching", "neural radiance fields", "gaussian ' +
    'splatting", "sim to real transfer", "offline reinforcement learning", "world models", ' +
    '"model based rl", "curriculum learning", "meta learning", "few shot learning", ' +
    '"federated learning", "differential privacy", "homomorphic encryption", "gravitational ' +
    'lensing", "dark matter halos", "exoplanet detection", "transit photometry", "radial ' +
    'velocity surveys", "gravitational waves", "cosmic microwave background", "dark energy ' +
    'equation of state", "galactic dynamics", "accretion disk physics", "neutron star ' +
    'mergers", "supernova nucleosynthesis", "lattice qcd", "supersymmetry searches", "string ' +
    'theory landscape", "holographic principle", "ads cft duality", "loop quantum gravity", ' +
    '"topological insulators", "quantum hall effect", "high temperature superconductivity", ' +
    '"bose einstein condensates", "ultracold atoms", "quantum simulation", "tensor networks", ' +
    '"dmrg algorithm", "protein structure prediction", "single cell rna sequencing", "crispr ' +
    'base editing", "phylogenetic inference", "molecular dynamics", "density functional ' +
    'theory", "ab initio chemistry", "ramsey theory", "category theory homotopy", "stochastic ' +
    'gradient descent convergence", "online learning regret") — never the literal title or ' +
    'author names.',
  github:
    'If the input looks like software repos ("name — description"), distill to the technical ' +
    'concept the repo embodies (e.g. "vector databases", "code search engines", "agent ' +
    'frameworks", "build systems", "package managers", "monorepo tooling", "static site ' +
    'generators", "headless cms", "graphql servers", "rest api frameworks", "rpc systems", ' +
    '"service meshes", "container orchestration", "infrastructure as code", "ci pipelines", ' +
    '"continuous deployment", "feature flags", "observability stacks", "log aggregation", ' +
    '"distributed tracing", "metrics collection", "time series databases", "embedded ' +
    'databases", "key value stores", "document databases", "graph databases", "search ' +
    'engines", "stream processing", "message queues", "event sourcing", "cqrs frameworks", ' +
    '"state machines", "workflow engines", "task schedulers", "cron alternatives", "rate ' +
    'limiters", "circuit breakers", "load balancers", "reverse proxies", "tls libraries", ' +
    '"cryptography toolkits", "secrets management", "policy engines", "authorization ' +
    'frameworks", "identity providers", "ssh tooling", "vpn implementations", "wireguard ' +
    'userspace", "dns servers", "http clients", "websocket libraries", "browser automation", ' +
    '"headless browsers", "ui component libraries", "animation engines", "reactive state ' +
    'stores", "form validation", "data fetching libraries", "build tools javascript", ' +
    '"transpilers", "linters and formatters", "static analysis tools", "fuzzers", "property ' +
    'based testing", "mutation testing", "code coverage tools", "benchmark harnesses", ' +
    '"profilers", "tracing instrumentation", "deep learning frameworks", "model serving", ' +
    '"inference engines", "training orchestrators", "experiment trackers", "feature stores", ' +
    '"data versioning", "data validation", "etl pipelines", "data lineage", "diffusion model ' +
    'libraries", "llm orchestration", "embedding stores", "rag toolkits", "agentic ' +
    'frameworks", "code generation tools") — never just the repo name.',
  stackoverflow:
    'If the input looks like Stack Overflow questions ("How do I …", "Why does …", "What is ' +
    'the difference …"), distill to the underlying technical problem or concept (e.g. "regex ' +
    'performance", "git history rewriting", "javascript closures", "memory alignment", ' +
    '"python generators", "async await semantics", "promise chaining", "event loop ' +
    'concurrency", "threading vs multiprocessing", "type inference", "generics variance", ' +
    '"dependency injection", "interface segregation", "abstract base classes", "decorators ' +
    'python", "metaclasses", "mixins composition", "operator overloading", "context ' +
    'managers", "with statement", "iterator protocol", "list comprehension", "lazy ' +
    'evaluation", "tail call optimization", "recursion depth", "stack overflow vs heap", ' +
    '"memory leaks", "garbage collection tuning", "reference counting", "weak references", ' +
    '"circular imports", "module system", "namespace packages", "virtual environments", ' +
    '"package management python", "pip vs conda", "wheel building", "string encoding", ' +
    '"unicode normalization", "byte order marks", "regex unicode flags", "json ' +
    'serialization", "yaml safe load", "csv quoting", "datetime timezone aware", "iso 8601 ' +
    'parsing", "epoch milliseconds", "monotonic clocks", "hash collisions", "set vs dict ' +
    'performance", "ordered dict", "binary search", "two pointer technique", "sliding ' +
    'window", "dynamic programming", "memoization caching", "lru cache", "tree traversal", ' +
    '"graph algorithms", "topological sort", "shortest path", "bit manipulation", "bitwise ' +
    'tricks", "endianness", "floating point comparison", "integer overflow", "atomic ' +
    'operations", "lock free programming", "spin locks vs mutex", "thread safety guarantees", ' +
    '"race conditions", "deadlock detection", "starvation prevention", "process forking", ' +
    '"exec replacement", "signal handling", "child reaping", "file descriptor leaks", "select ' +
    'vs epoll", "non blocking io", "edge triggered events", "tcp keepalive tuning", "socket ' +
    'options", "http connection pooling", "tls handshake errors") — never the literal ' +
    'question phrasing.',
  serverfault:
    'If the input looks like Server Fault questions (sysadmin/devops/infrastructure — "How do ' +
    'I configure …", "Why is my server …", "What is the best way to set up …"), distill to ' +
    'the operational concept (e.g. "nginx tuning", "ssh tunneling", "linux process ' +
    'management", "tcp tuning", "systemd services", "iptables firewalling", "nftables ' +
    'migration", "ufw configuration", "selinux policy", "apparmor profiles", "kernel ' +
    'parameter sysctl", "network namespace", "veth pair bridging", "linux bridge networking", ' +
    '"vlan tagging", "bonding teaming", "mtu jumbo frames", "tcp congestion control", "bbr ' +
    'cubic", "ipv6 stack", "ipv6 router advertisement", "dhcp server config", "dns zone ' +
    'transfer", "bind named tuning", "unbound recursive resolver", "cron timing pitfalls", ' +
    '"anacron systemd timers", "logrotate retention", "journalctl filters", "rsyslog ' +
    'forwarding", "syslog ng routing", "ntp chrony sync", "ptp precision time", "raid mdadm ' +
    'rebuild", "lvm snapshot", "thin provisioning", "filesystem tuning ext4", "xfs ' +
    'fragmentation", "zfs arc tuning", "btrfs subvolumes", "nfs export", "smb samba sharing", ' +
    '"iscsi target", "fibre channel zoning", "san storage layout", "haproxy backend health", ' +
    '"keepalived vrrp", "load balancer ssl termination", "reverse proxy caching", "varnish ' +
    'cache invalidation", "cdn origin shield", "kubernetes pod evictions", "kubelet resource ' +
    'pressure", "ingress controller routing", "service mesh sidecar", "container restart ' +
    'policy", "docker storage driver", "registry authentication", "image layer cache", ' +
    '"terraform state locking", "ansible idempotency", "salt master scaling", "puppet catalog ' +
    'compilation", "chef cookbook upload", "vault secret engine", "kerberos ticket renewal", ' +
    '"ldap replication", "sssd cache flush", "sudoers ldap rules", "pam auth stack", "ssh ' +
    'authorized keys", "ssh certificate ca", "two factor ssh", "fail2ban jails", "intrusion ' +
    'detection ossec", "log shipping filebeat", "metric scraping prometheus", "alertmanager ' +
    'routes", "grafana dashboards", "backup restore strategy", "snapshot consistency", ' +
    '"disaster recovery runbook", "rto rpo planning") — never the literal question phrasing.',
  superuser:
    'If the input looks like Super User questions (consumer / power-user computing — ' +
    'Windows/Mac/Linux desktop, hardware, browsers, OS troubleshooting — "How do I disable ' +
    '…", "Why does my laptop …", "What is the difference between …"), distill to the consumer ' +
    'concept (e.g. "windows registry", "disk partitioning", "browser caching", "wifi ' +
    'troubleshooting", "ssd trim", "boot loader", "uefi vs legacy bios", "secure boot keys", ' +
    '"tpm chip pcr", "bitlocker recovery", "filevault disk encryption", "luks encrypted ' +
    'volume", "drive imaging clone", "windows update rollback", "macos software update", ' +
    '"linux mint kernel", "task manager startup", "windows services tuning", "registry hive ' +
    'backup", "regedit value types", "powershell execution policy", "windows terminal panes", ' +
    '"wsl distribution swap", "wsl gpu passthrough", "hyper v vm config", "wmi event ' +
    'subscription", "group policy editor", "local security policy", "user account control", ' +
    '"uac elevation prompt", "windows defender exclusion", "microsoft defender atp", ' +
    '"smartscreen filter", "controlled folder access", "browser extension sandbox", "site ' +
    'cookies clearing", "browser profile sync", "history sync conflict", "sound device ' +
    'routing", "audio sample rate mismatch", "monitor refresh rate", "hdr color profile", ' +
    '"icc profile calibration", "color gamut srgb", "gpu driver clean install", "nvidia ' +
    'control panel", "amd radeon settings", "intel arc driver", "battery health calibration", ' +
    '"cpu throttling thermal", "fan curve tuning", "undervolting laptop", "ram timings xmp", ' +
    '"ssd firmware update", "nvme heatsink temps", "external usb enclosure", "thunderbolt ' +
    'dock issues", "usb c power delivery", "bluetooth pairing reset", "wifi 6e channel ' +
    'width", "router qos rules", "mesh wifi roaming", "vpn dns leak", "dns over https", ' +
    '"browser fingerprinting", "cookie sameSite", "windows hello biometrics", "macos touch id ' +
    'reset", "icloud keychain sync", "1password import", "outlook profile rebuild", "exchange ' +
    'autodiscover", "office license activation", "onedrive sync stuck", "teams cache clear", ' +
    '"zoom webcam not detected", "obs scene collections", "gpu accelerated transcoding", ' +
    '"external monitor scaling", "fractional dpi linux", "windows event viewer", "mac console ' +
    'logs", "hardware diagnostics memtest", "smartctl drive health", "boot to safe mode", ' +
    '"recovery partition reset") — never the literal question phrasing.',
  askubuntu:
    'If the input looks like Ask Ubuntu questions (Ubuntu / Linux-desktop specific — ' +
    'apt/snap, ppa, grub, nvidia drivers, dual-boot, gnome/unity, kernel updates — "How do I ' +
    'install …", "How do I fix my …", "Why does Ubuntu …"), distill to the Linux-desktop ' +
    'concept (e.g. "apt package management", "ppa repositories", "grub bootloader", "snap ' +
    'packages", "nvidia drivers linux", "linux dual boot", "ubuntu kernel update", "lts ' +
    'release upgrade", "do release upgrade", "apt pinning preferences", "dpkg conflict ' +
    'resolution", "broken dependencies", "held packages", "deb file install", "apt source ' +
    'list", "third party ppa key", "snap classic confinement", "flatpak permissions", ' +
    '"appimage integration", "snap refresh schedule", "systemd unit override", "systemd timer ' +
    'fallback", "boot order grub2", "secure boot mok enrollment", "uefi boot manager", "efi ' +
    'system partition", "shim signed bootloader", "memtest grub entry", "gnome shell ' +
    'extensions", "dconf settings", "gtk theme switching", "icon theme override", "wayland ' +
    'session login", "x11 fallback session", "xrandr multi monitor", "fractional scaling ' +
    'wayland", "hidpi mixed dpi", "gnome tweaks tool", "ubuntu sleep wake", "suspend to ram", ' +
    '"hibernation swap file", "power profile daemon", "pulseaudio replace pipewire", "alsa ' +
    'device routing", "bluetooth headset codec", "wifi card firmware", "broadcom proprietary ' +
    'driver", "intel wireless tuning", "nvidia prime offload", "optimus laptop graphics", ' +
    '"nouveau driver issues", "nvidia kernel module", "linux headers install", "dkms module ' +
    'rebuild", "ubuntu kernel boot fail", "fsck recovery mode", "root filesystem readonly", ' +
    '"luks unlock prompt", "encrypted home migration", "ecryptfs deprecation", "btrfs ubuntu ' +
    'install", "zfs root pool", "lvm logical volume", "swap file vs partition", "apt cache ' +
    'cleanup", "old kernel removal", "ubuntu firewall ufw", "iptables persistent rules", ' +
    '"apparmor ubuntu profile", "user namespaces sysctl", "snap network plug", "user systemd ' +
    'services", "auto login configuration", "lightdm gdm switch", "keyring unlock issue", ' +
    '"policy kit prompt", "sudo timeout config", "user added to group", "udev rules ' +
    'persistent", "fstab uuid mounting", "ubuntu time sync", "locale generation", "keyboard ' +
    'layout switch", "ibus fcitx input method") — never the literal question phrasing.',
  crossvalidated:
    'If the input looks like Cross Validated questions (statistics / ML / data-analysis ' +
    'methodology — "How do I interpret …", "Why does my model …", "What is the difference ' +
    'between …", "When should I use …"), distill to the statistical or ML concept (e.g. ' +
    '"p value", "bayesian inference", "logistic regression", "cross validation", ' +
    '"confidence intervals", "random forests", "feature engineering", "hypothesis testing", ' +
    '"maximum likelihood", "regularization", "ridge regression", "lasso regression", ' +
    '"elastic net", "gradient boosting", "xgboost tuning", "lightgbm parameters", ' +
    '"support vector machines", "kernel methods", "principal component analysis", ' +
    '"factor analysis", "linear discriminant analysis", "k means clustering", ' +
    '"hierarchical clustering", "dbscan density", "gaussian mixture models", ' +
    '"expectation maximization", "markov chain monte carlo", "metropolis hastings", ' +
    '"gibbs sampling", "variational inference", "posterior distribution", ' +
    '"prior distribution", "bayes factor", "credible intervals", "bootstrap resampling", ' +
    '"permutation test", "t test interpretation", "anova decomposition", ' +
    '"chi squared test", "wilcoxon rank sum", "mann whitney u", "kolmogorov smirnov", ' +
    '"shapiro wilk normality", "qq plot diagnostics", "residual analysis", ' +
    '"heteroscedasticity", "multicollinearity diagnostics", "variance inflation factor", ' +
    '"r squared interpretation", "adjusted r squared", "akaike information criterion", ' +
    '"bayesian information criterion", "deviance information criterion", "roc curve", ' +
    '"precision recall curve", "f1 score", "matthews correlation coefficient", ' +
    '"calibration plots", "imbalanced classes", "smote oversampling", "class weighting", ' +
    '"survival analysis", "kaplan meier", "cox proportional hazards", "time series ' +
    'arima", "stationarity test", "autocorrelation function", "partial autocorrelation", ' +
    '"seasonal decomposition", "holt winters", "state space models", "kalman smoothing", ' +
    '"hidden markov models", "bayesian networks", "causal inference", "propensity score ' +
    'matching", "instrumental variables", "regression discontinuity", "difference in ' +
    'differences", "double machine learning", "neural network backprop", ' +
    '"convolutional layers", "recurrent units", "transformer attention", "embedding ' +
    'spaces", "dropout regularization", "batch normalization", "early stopping", ' +
    '"learning rate scheduling", "transfer learning", "data augmentation", ' +
    '"label smoothing", "calibration temperature scaling") — never the literal ' +
    'question phrasing.',
  math:
    'If the input looks like Mathematics SE questions (pure math — "Prove that …", "Show that ' +
    '…", "How do I integrate …", "Find the eigenvalues …", "What is the determinant …"), ' +
    'distill to the mathematical concept (e.g. "linear algebra", "eigenvalues", "integration ' +
    'by parts", "group theory", "modular arithmetic", "infinite series", "matrix ' +
    'decomposition", "differential equations", "complex analysis", "graph theory", "limits ' +
    'epsilon delta", "taylor series", "fourier series", "laplace transform", "z transform", ' +
    '"real analysis", "measure theory", "lebesgue integration", "borel sigma algebra", ' +
    '"topology metric spaces", "compactness connectedness", "fundamental group", "homology ' +
    'cohomology", "differential geometry", "riemannian manifold", "lie groups", ' +
    '"representation theory", "ring theory", "field extensions", "galois theory", "algebraic ' +
    'number theory", "elliptic curves", "modular forms", "diophantine equations", "number ' +
    'theory primes", "prime distribution", "riemann zeta function", "p adic numbers", ' +
    '"category theory", "functor adjunction", "natural transformations", "homological ' +
    'algebra", "spectral sequences", "algebraic geometry", "scheme theory", "combinatorics ' +
    'counting", "generating functions", "binomial identities", "ramsey theory", "extremal ' +
    'combinatorics", "probabilistic method", "graph coloring", "chromatic polynomial", ' +
    '"matchings hall theorem", "flows max flow min cut", "probability measure", "random ' +
    'variables", "law of large numbers", "central limit theorem", "martingales", "stochastic ' +
    'processes", "markov chains stationary", "brownian motion", "ito calculus", "ergodic ' +
    'theory", "convex analysis", "lagrangian duality", "linear programming simplex", ' +
    '"interior point methods", "optimization gradient", "calculus of variations", "euler ' +
    'lagrange equations", "boundary value problems", "sturm liouville", "partial differential ' +
    'equations", "heat equation", "wave equation", "navier stokes", "harmonic analysis", ' +
    '"wavelets multiresolution", "operator theory", "spectral theorem", "functional ' +
    'analysis", "banach hilbert spaces", "fixed point theorems", "ordinary differential ' +
    'systems", "phase plane analysis", "bifurcation theory", "chaos lyapunov exponent") — ' +
    'never the literal question phrasing.',
  codereview:
    'If the input looks like Code Review SE questions (review of working code — "[Language] ' +
    '[thing] — please review", "Refactoring my [thing] for [reason]", "Is this idiomatic …", ' +
    '"How can I improve this …", "My approach to [pattern]"), distill to the code-review or ' +
    'idiomatic-style concept (e.g. "code refactoring", "design patterns", "code smells", ' +
    '"single responsibility principle", "premature optimization", "naming conventions", ' +
    '"error handling patterns", "object encapsulation", "function composition", ' +
    '"code readability", "separation of concerns", "dependency injection", ' +
    '"inversion of control", "open closed principle", "liskov substitution principle", ' +
    '"interface segregation", "dont repeat yourself", "keep it simple stupid", ' +
    '"you arent gonna need it", "law of demeter", "tell dont ask", "command query ' +
    'separation", "primitive obsession", "feature envy", "shotgun surgery", "long ' +
    'parameter list", "data clumps", "god object", "magic numbers", "magic strings", ' +
    '"cyclomatic complexity", "nested conditionals", "guard clauses", "early return", ' +
    '"strategy pattern", "factory pattern", "builder pattern", "observer pattern", ' +
    '"decorator pattern", "adapter pattern", "facade pattern", "template method", ' +
    '"visitor pattern", "iterator pattern", "null object pattern", "memento pattern", ' +
    '"chain of responsibility", "composite pattern", "flyweight pattern", "proxy ' +
    'pattern", "singleton overuse", "service locator", "anti corruption layer", ' +
    '"mvc separation", "mvvm binding", "domain driven design", "ubiquitous language", ' +
    '"value objects", "entity identity", "aggregate roots", "repository pattern", ' +
    '"unit of work", "anemic domain model", "rich domain model", "command pattern", ' +
    '"event sourcing", "cqrs read model", "test driven development", "red green ' +
    'refactor", "test smells", "fragile tests", "test pyramid", "integration tests", ' +
    '"contract tests", "mock vs stub", "spy vs mock", "test fixtures", "arrange act ' +
    'assert", "given when then", "code coverage line", "branch coverage", "mutation ' +
    'testing", "code review checklist", "pull request size", "atomic commits", ' +
    '"version control hygiene", "exception swallowing", "try with resources", ' +
    '"resource cleanup", "thread safety annotations", "immutability benefits", ' +
    '"defensive copying", "fluent interface") — never the literal question phrasing ' +
    'or the language name alone.',
  electronics:
    'If the input looks like Electrical Engineering SE questions (circuits / hardware / ' +
    'embedded — "How does this circuit …", "Why is my [component] …", "What does this ' +
    '[chip] do", "How do I drive a [thing] from a [thing]", "Calculating [resistor/' +
    'capacitor] for …"), distill to the electronics or EE concept (e.g. "ohms law", ' +
    '"voltage divider", "transistor biasing", "operational amplifier", "pull-up ' +
    'resistor", "decoupling capacitors", "switching power supply", "pcb routing", ' +
    '"i2c protocol", "spi bus", "microcontroller interrupts", "adc sampling", ' +
    '"h-bridge", "ground loops", "rf shielding", "pwm signals", "schmitt trigger", ' +
    '"differential pair routing", "impedance matching", "transmission line theory", ' +
    '"reflection coefficient", "smith chart", "antenna design basics", "balun ' +
    'transformer", "ferrite bead filtering", "emc esd protection", "tvs diode ' +
    'clamping", "zener regulator", "ldo dropout voltage", "buck converter design", ' +
    '"boost converter design", "buck boost topology", "flyback transformer", "current ' +
    'sense resistor", "shunt vs hall sensing", "gate driver charge pump", "mosfet ' +
    'rds on", "gate threshold voltage", "miller plateau", "thermal pad design", ' +
    '"thermal vias", "junction temperature", "snubber circuit", "rc filter cutoff", ' +
    '"sallen key filter", "anti aliasing filter", "successive approximation adc", ' +
    '"sigma delta adc", "dac reconstruction", "reference voltage drift", "bandgap ' +
    'reference", "crystal oscillator startup", "pierce oscillator", "phase noise", ' +
    '"pll loop filter", "ldo vs switcher tradeoff", "load step response", "esr ' +
    'capacitor selection", "x7r vs c0g dielectric", "tantalum vs ceramic", ' +
    '"electrolytic aging", "via stitching ground", "star ground topology", ' +
    '"chassis ground vs signal ground", "kelvin sensing", "four wire measurement", ' +
    '"oscilloscope probing", "10x probe compensation", "bandwidth limiting", ' +
    '"anti-aliasing scope", "logic analyzer triggering", "uart framing", "rs485 ' +
    'differential", "can bus arbitration", "modbus rtu vs tcp", "1 wire protocol", ' +
    '"jtag boundary scan", "swd debug interface", "bootloader image signing", ' +
    '"firmware over the air", "watchdog timer", "brown out detector", "low power ' +
    'sleep modes", "rtc battery backup", "ferroelectric memory", "flash wear ' +
    'leveling", "eeprom write endurance", "i2s audio bus", "sdio sd card protocol", ' +
    '"usb pd negotiation", "esd diode placement") — never the literal question ' +
    'phrasing or a bare component name alone.',
  security:
    'If the input looks like Information Security SE questions (infosec / cryptography / ' +
    'defensive engineering — "Is it safe to …", "How do I protect against …", "Why is my ' +
    '[protocol/cert] …", "What is the difference between [hash/cipher]", "Should I use ' +
    '[auth scheme] for …"), distill to the security concept (e.g. "tls handshake", ' +
    '"password hashing", "csrf protection", "sql injection", "xss prevention", ' +
    '"key derivation function", "session management", "two factor authentication", ' +
    '"rate limiting", "buffer overflow", "zero day vulnerabilities", "public key ' +
    'cryptography", "salting passwords", "oauth flow", "certificate pinning", ' +
    '"side channel attacks", "man in the middle", "replay attack", "downgrade attack", ' +
    '"padding oracle attack", "timing attack", "spectre meltdown", "rowhammer attack", ' +
    '"return oriented programming", "stack canaries", "address space layout ' +
    'randomization", "data execution prevention", "control flow integrity", ' +
    '"sandboxing isolation", "principle of least privilege", "defense in depth", ' +
    '"zero trust networking", "mutual tls auth", "certificate transparency", ' +
    '"hsts header", "content security policy", "subresource integrity", ' +
    '"cross origin resource sharing", "same origin policy", "samesite cookies", ' +
    '"http only cookies", "secure cookie flag", "json web tokens", "jwt signing ' +
    'algorithms", "rs256 vs hs256", "openid connect", "saml federation", "kerberos ' +
    'tickets", "ntlm relay", "active directory hardening", "ldap injection", ' +
    '"command injection", "path traversal", "xxe injection", "ssrf attack", ' +
    '"deserialization vulnerabilities", "race condition toctou", "directory bruteforce", ' +
    '"privilege escalation", "lateral movement", "credential stuffing", "password ' +
    'spraying", "brute force protection", "captcha challenges", "argon2 bcrypt scrypt", ' +
    '"pbkdf2 iterations", "hkdf derivation", "hmac authentication", "aes gcm mode", ' +
    '"chacha20 poly1305", "rsa oaep padding", "elliptic curve cryptography", ' +
    '"ed25519 signatures", "ecdh key exchange", "post quantum cryptography", ' +
    '"hardware security modules", "secure enclaves", "tpm attestation", "secure boot ' +
    'chain", "luks disk encryption", "tor onion routing", "wireguard handshake", ' +
    '"ipsec tunnel mode", "dns over https", "dnssec validation", "wifi wpa3", ' +
    '"siem detection", "edr telemetry", "threat modeling stride", "owasp top ten", ' +
    '"cve scoring cvss", "responsible disclosure", "bug bounty triage", ' +
    '"phishing simulation") — never the literal question phrasing or a bare ' +
    'tool/CVE name alone.',
  dsp:
    'If the input looks like Signal Processing SE questions (DSP / digital filters / ' +
    'spectral analysis — "How do I implement …", "Why does my filter …", "What is the ' +
    'difference between [transform/filter]", "How do I sample …", "How do I window …", ' +
    '"What does this spectrum show"), distill to the DSP concept (e.g. "fast fourier ' +
    'transform", "fir filter design", "iir filter stability", "windowing functions", ' +
    '"sampling theorem", "discrete cosine transform", "z transform", "convolution ' +
    'theorem", "spectrogram", "kalman filter", "matched filter", "wavelet transform", ' +
    '"phase locked loop", "decimation upsampling", "frequency response", "white noise", ' +
    '"aliasing", "group delay", "phase delay", "linear phase fir", "minimum phase ' +
    'system", "all pass filter", "comb filter", "notch filter", "butterworth filter", ' +
    '"chebyshev filter", "elliptic filter", "bessel filter", "biquad section", ' +
    '"cascade form", "direct form i", "direct form ii", "transposed direct form", ' +
    '"lattice structure", "polyphase decomposition", "multirate filter banks", ' +
    '"perfect reconstruction", "qmf filterbank", "noble identities", "halfband ' +
    'filter", "cic filter", "farrow interpolator", "fractional delay", "adaptive ' +
    'filter lms", "rls adaptive filter", "wiener filter", "particle filter", ' +
    '"extended kalman filter", "unscented kalman", "stft analysis", "constant q ' +
    'transform", "mel spectrogram", "mfcc features", "cepstrum analysis", "linear ' +
    'predictive coding", "autocorrelation function", "cross correlation", "circular ' +
    'convolution", "overlap add method", "overlap save method", "fft butterfly", ' +
    '"radix 2 fft", "radix 4 fft", "bluestein chirp z", "goertzel algorithm", ' +
    '"window leakage", "hann window", "hamming window", "blackman harris window", ' +
    '"kaiser window", "flat top window", "scalloping loss", "spectral leakage", ' +
    '"zero padding interpretation", "snr estimation", "thd measurement", "spurious ' +
    'free dynamic range", "quantization noise", "dithering", "noise shaping", ' +
    '"oversampling delta sigma", "anti aliasing analog", "reconstruction filter", ' +
    '"sample rate conversion", "polyphase resampling", "bandpass sampling", ' +
    '"hilbert transform", "analytic signal", "iq demodulation", "carrier recovery", ' +
    '"costas loop", "frequency synthesizer", "digital downconversion") — never the ' +
    'literal question phrasing.',
  ux:
    'If the input looks like User Experience SE questions (UX design / interaction design / usability — ' +
    '"How should I design …", "Is it better to …", "When should I use …", "Why do users …", ' +
    '"What is the best way to display …"), distill to the UX or interaction-design concept (e.g. ' +
    '"information architecture", "form design", "navigation patterns", "user onboarding", "progressive ' +
    'disclosure", "affordances", "fitts law", "hick law", "miller law", "jakob law", "peak end rule", ' +
    '"error message design", "empty states", "loading indicators", "modal dialogs", "responsive ' +
    'design", "accessibility wcag", "mobile first design", "color contrast", "typography hierarchy", ' +
    '"user flow", "card sorting", "wireframing", "design systems", "microcopy", "dark patterns", ' +
    '"user research", "usability heuristics", "nielsen heuristics", "cognitive load", "gestalt ' +
    'principles", "visual hierarchy", "white space", "skeuomorphism", "flat design", "neumorphism", ' +
    '"material design", "atomic design", "design tokens", "component library", "style guide", "user ' +
    'persona", "journey mapping", "empathy mapping", "jobs to be done", "usability testing", "a b ' +
    'testing", "heatmap analysis", "eye tracking", "think aloud protocol", "contextual inquiry", ' +
    '"diary studies", "task analysis", "heuristic evaluation", "information scent", "breadcrumb ' +
    'navigation", "mega menu", "hamburger menu", "bottom navigation", "tab bar", "sticky header", ' +
    '"infinite scroll", "pagination patterns", "search autocomplete", "faceted search", "filter ' +
    'chips", "zero state design", "tooltips", "snackbars", "toast notifications", "form validation", ' +
    '"inline validation", "skeleton screens", "progress indicators", "micro interactions", "animation ' +
    'timing", "easing curves", "responsive breakpoints", "fluid typography", "touch targets", ' +
    '"gesture design", "keyboard navigation", "focus management", "skip links", "aria live regions", ' +
    '"dark mode design") — never the literal question phrasing or a bare tool name (figma/sketch).',
  gis:
    'If the input looks like GIS Stack Exchange questions (geographic information systems / mapping / ' +
    'spatial analysis / cartography — "How do I project …", "Why is my shapefile …", "What is the ' +
    'difference between [crs/format]", "How do I geocode …", "How do I clip a raster …"), distill to ' +
    'the GIS or spatial-analysis concept (e.g. "coordinate reference systems", "shapefile format", ' +
    '"geojson schema", "raster vs vector", "spatial joins", "map projections", "postgis queries", ' +
    '"tile servers", "qgis plugins", "arcgis pro", "kriging interpolation", "remote sensing", ' +
    '"satellite imagery", "lidar processing", "georeferencing", "geocoding", "openstreetmap", ' +
    '"spatial indexing", "dem elevation models", "ndvi vegetation index", "topology rules", ' +
    '"buffer analysis", "web mercator", "epsg codes", "wgs84 datum", "utm zones", "haversine ' +
    'formula", "great circle distance", "ellipsoid model", "conformal projection", "equal area ' +
    'projection", "gdal warp", "ogr2ogr utility", "raster reprojection", "vector tiles", "mvt ' +
    'format", "tippecanoe tiler", "wms wmts service", "geoserver mapserver", "mapbox gl", "st ' +
    'intersects", "st buffer", "st union", "gist index", "geohash encoding", "raster algebra", ' +
    '"zonal statistics", "viewshed analysis", "watershed delineation", "slope aspect", "hillshade ' +
    'rendering", "contour generation", "lidar las format", "point cloud classification", ' +
    '"multispectral bands", "sar imagery", "modis sentinel landsat", "ndwi water index", "false ' +
    'color composite", "supervised classification", "random forest classifier", "accuracy ' +
    'assessment", "bilinear resampling", "idw interpolation", "voronoi tessellation", "delaunay ' +
    'triangulation", "tin surface", "reverse geocoding", "address parsing", "network analysis", ' +
    '"shortest path routing", "isochrones service area", "pgrouting osrm valhalla", "proj4 ' +
    'strings", "well known text", "geoparquet format", "spatial autocorrelation", "morans i ' +
    'statistic", "hot spot analysis", "kernel density estimation", "choropleth design", "geotiff ' +
    'cog", "stac catalog", "mbtiles format") — never the literal question phrasing or a bare ' +
    'tool/file-extension alone.',
  biology:
    'If the input looks like Biology SE questions (life sciences — cell biology, ' +
    'genetics, ecology, physiology, evolution, microbiology, neuroscience, biochemistry ' +
    '— "Why does …", "How does …", "What is the difference between [process/structure]", ' +
    '"How do [organisms/cells] …"), distill to the biology concept (e.g. "cell division", ' +
    '"dna replication", "protein folding", "genetic drift", "natural selection", ' +
    '"enzyme kinetics", "neural signaling", "photosynthesis pathways", "crispr editing", ' +
    '"mitochondrial dna", "ribosome function", "antibody response", "speciation", ' +
    '"ecological niche", "trophic cascade", "homeostasis regulation", "cell signaling", ' +
    '"gene expression", "meiosis recombination", "phylogenetic trees", "stem cell ' +
    'differentiation", "action potential", "membrane transport", "sodium potassium ' +
    'pump", "calcium signaling", "g protein coupled receptors", "kinase cascade", ' +
    '"cyclic amp", "dna repair pathways", "homologous recombination", "non homologous ' +
    'end joining", "telomere shortening", "epigenetic methylation", "histone ' +
    'modification", "chromatin remodeling", "transcription factors", "messenger rna ' +
    'splicing", "alternative splicing", "ribosomal translation", "post translational ' +
    'modification", "ubiquitin proteasome", "autophagy pathway", "apoptosis ' +
    'cascade", "p53 tumor suppressor", "oncogene activation", "cell cycle ' +
    'checkpoints", "mitotic spindle", "cytoskeleton actin", "microtubule dynamics", ' +
    '"motor proteins kinesin", "endoplasmic reticulum", "golgi trafficking", ' +
    '"endocytosis pathways", "exocytosis vesicles", "lysosome digestion", ' +
    '"peroxisome metabolism", "krebs cycle", "electron transport chain", "atp ' +
    'synthase", "glycolysis pathway", "gluconeogenesis", "fatty acid oxidation", ' +
    '"urea cycle", "nitrogen fixation", "calvin cycle", "photosystem ii", ' +
    '"hardy weinberg equilibrium", "linkage disequilibrium", "gwas analysis", ' +
    '"epistasis interaction", "polygenic inheritance", "x linked traits", ' +
    '"mitochondrial inheritance", "horizontal gene transfer", "endosymbiotic ' +
    'theory", "convergent evolution", "founder effect", "bottleneck event", ' +
    '"sexual selection", "kin selection", "altruism evolution", "predator prey ' +
    'cycles", "lotka volterra", "carrying capacity", "keystone species", ' +
    '"biome classification", "biogeochemical cycles", "innate immunity", ' +
    '"adaptive immunity", "t cell receptor", "mhc presentation", "cytokine ' +
    'signaling", "synaptic plasticity", "neurotransmitter release") — never the ' +
    'literal question phrasing or a bare species name alone.',
  money:
    'If the input looks like Personal Finance & Money SE questions (practical finance — budgeting, ' +
    'investing, taxes, retirement, mortgages, credit, insurance, banking — "Should I …", "How do I …", ' +
    '"What is the difference between [account/instrument]", "Is it better to [save/invest/pay off]", ' +
    '"How does [tax/credit/loan] work"), distill to the personal-finance concept (e.g. "compound ' +
    'interest", "index fund investing", "roth ira", "401k rollover", "mortgage amortization", "credit ' +
    'utilization", "tax loss harvesting", "emergency fund", "asset allocation", "dollar cost ' +
    'averaging", "capital gains tax", "estate planning", "term vs whole life insurance", "ach vs ' +
    'wire transfer", "credit score factors", "etf vs mutual fund", "bond duration", "inflation ' +
    'hedging", "umbrella insurance", "expense ratio", "marginal tax rate", "sep ira", "hsa triple ' +
    'tax advantage", "backdoor roth", "rmd required minimum", "social security claiming", "treasury ' +
    'bills", "tips inflation protected", "i bonds", "municipal bonds", "taxable equivalent yield", ' +
    '"bond ladder", "yield curve", "fed funds rate", "mortgage pmi", "jumbo loan", "fha loan", "va ' +
    'loan", "refinance breakeven", "arm vs fixed mortgage", "mortgage points buydown", "heloc home ' +
    'equity", "cash out refinance", "itemized vs standard deduction", "mortgage interest ' +
    'deduction", "qbi deduction", "tax brackets progressive", "amt alternative minimum", "self ' +
    'employment tax", "estimated quarterly taxes", "schedule c business", "llc s corp election", ' +
    '"qualified dividend tax", "long vs short capital gains", "wash sale rule", "form 1099 div", ' +
    '"fbar reporting", "fico vs vantagescore", "hard vs soft inquiry", "debt to income ratio", ' +
    '"debt avalanche method", "debt snowball method", "balance transfer offer", "fdic insurance", ' +
    '"sipc coverage", "money market funds", "target date fund", "three fund portfolio", "total ' +
    'stock market", "international diversification", "factor investing", "dividend reinvestment", ' +
    '"rebalancing portfolio", "sequence of returns", "safe withdrawal rate", "four percent rule", ' +
    '"annuity types", "529 plan college", "coverdell esa", "ugma utma custodial", "escrow ' +
    'account", "credit card rewards", "churning credit cards", "foreign transaction fees", ' +
    '"disability insurance") — never the literal question phrasing or a bare ticker / brand name ' +
    'alone.',
  philosophy:
    'If the input looks like Philosophy SE questions (formal philosophy — ethics, logic, ' +
    'epistemology, metaphysics, philosophy of mind, philosophy of science, political philosophy, ' +
    'aesthetics — "What did [thinker] mean by …", "How can we know …", "Is it ethical to …", ' +
    '"What is the difference between [concept] and [concept]", "Can [X] be [Y]"), distill to the ' +
    'philosophical concept (e.g. "categorical imperative", "trolley problem", "modus ponens", ' +
    '"modus tollens", "epistemic justification", "mind body problem", "free will determinism", ' +
    '"moral relativism", "utilitarianism", "deontological ethics", "virtue ethics", "social ' +
    'contract", "ship of theseus", "problem of evil", "ontological argument", "phenomenology", ' +
    '"logical positivism", "the is ought gap", "qualia", "naturalistic fallacy", "transcendental ' +
    'idealism", "existentialism", "gettier problem", "justified true belief", "foundationalism", ' +
    '"coherentism", "skepticism brain in vat", "problem of induction", "cartesian doubt", ' +
    '"physicalism", "panpsychism", "consciousness hard problem", "chinese room argument", ' +
    '"philosophical zombie", "compatibilism", "moral realism", "expressivism", "divine command ' +
    'theory", "natural law ethics", "rule vs act utilitarianism", "kingdom of ends", "golden mean ' +
    'aristotle", "eudaimonia flourishing", "stoicism epictetus", "epicurean atomism", "platonic ' +
    'forms", "allegory of the cave", "socratic method", "hegelian dialectic", "master slave ' +
    'dialectic", "marxist materialism", "alienation labor", "will to power nietzsche", "eternal ' +
    'recurrence", "ubermensch", "death of god", "kierkegaard angst", "leap of faith", "heidegger ' +
    'dasein", "being and time", "sartre bad faith", "existence precedes essence", "absurdism ' +
    'camus", "frankfurt school", "habermas communicative action", "foucault power knowledge", ' +
    '"panopticon discipline", "derrida deconstruction", "differance", "wittgenstein language ' +
    'games", "private language argument", "family resemblance", "popper falsificationism", "kuhn ' +
    'paradigm shifts", "russell logical atomism", "vienna circle", "ayer verification principle", ' +
    '"modal logic possible worlds", "lewis modal realism", "aquinas five ways", "anselm perfect ' +
    'being", "leibniz best world") — never the literal question phrasing or a bare thinker name ' +
    'alone.',
  cooking:
    'If the input looks like Seasoned Advice / Cooking SE questions (culinary technique / ' +
    'food chemistry / baking / knife skills — "How do I …", "Why does my [dish] …", ' +
    '"What is the difference between [technique] and [technique]", "Can I substitute ' +
    '[ingredient] for …", "How long should I [cook/rest/marinate] …"), distill to the ' +
    'cooking concept (e.g. "knife sharpening", "sourdough starter", "deglazing pan", ' +
    '"egg substitutes", "caramelization vs maillard", "ingredient substitutions", ' +
    '"salting meat", "tempering chocolate", "stock vs broth", "yeast fermentation", ' +
    '"emulsification", "umami flavor", "pressure cooking", "sous vide", "braising vs ' +
    'stewing", "dough hydration", "kitchen knife types", "deep fry oil temperature", ' +
    '"blooming spices", "resting meat", "cast iron seasoning", "blanching vegetables", ' +
    '"roux thickening", "leavening agents", "baking soda vs powder", "gluten ' +
    'development", "autolyse technique", "lamination puff pastry", "pate a choux", ' +
    '"royal icing consistency", "swiss meringue", "italian meringue", "french ' +
    'meringue", "swiss vs italian buttercream", "ganache ratios", "chocolate ' +
    'tempering curves", "couverture chocolate", "candy thermometer stages", "soft ' +
    'ball stage", "hard crack stage", "isomalt sugar work", "glucose syrup", ' +
    '"invert sugar", "sugar inversion", "preventing crystallization", "dough ' +
    'docking", "blind baking pie crust", "egg wash technique", "pan vs oven ' +
    'roasting", "convection bake adjustment", "steam injection bread", "dutch oven ' +
    'crust", "tangzhong yudane", "biga vs poolish", "stretch and fold", "no knead ' +
    'bread", "oven spring", "gelatinization starch", "retrogradation rice", "stale ' +
    'bread refresh", "knife rocking technique", "honing vs sharpening", "whetstone ' +
    'grits", "leidenfrost effect", "wok hei flavor", "stir fry heat management", ' +
    '"deglazing fond", "pan sauce reduction", "beurre blanc", "beurre monte", ' +
    '"mother sauces", "veloute bechamel espagnole", "velvet marinating", "dry brine ' +
    'turkey", "wet brine pork", "kosher vs table salt", "mise en place", ' +
    '"reverse sear steak", "sous vide finishing", "smoking wood pairing", ' +
    '"low and slow bbq", "stall during smoking", "the texas crutch", "bark ' +
    'formation", "myoglobin smoke ring", "nixtamalization corn", "fermenting hot ' +
    'sauce", "pickling vinegar ratios", "lacto fermentation", "kombucha scoby", ' +
    '"miso fermentation time", "tempeh inoculation", "natto fermentation") — ' +
    'never the literal question phrasing or a bare ingredient/brand name alone.',
  academia:
    'If the input looks like Academia SE questions (academic process / scholarly career — ' +
    'publishing, advising, grants, postdocs, peer review, conference logistics, PhD progression — ' +
    '"How do I …", "Should I …", "What is the difference between [journal/conference/program]", ' +
    '"Is it acceptable to …", "How long does [process] take"), distill to the academic-process ' +
    'concept (e.g. "peer review process", "h index", "thesis defense", "grant writing", ' +
    '"conference deadlines", "postdoc search", "phd advisor relationship", "journal impact ' +
    'factor", "open access publishing", "academic conferences", "tenure track", "academic ' +
    'citation", "predatory journals", "recommendation letters", "academic plagiarism", ' +
    '"double blind review", "thesis committee", "research ethics", "academic cv", ' +
    '"manuscript revision", "co authorship", "phd qualifying exam", "single blind review", ' +
    '"open peer review", "response to reviewers", "major vs minor revisions", "desk rejection", ' +
    '"salami slicing", "duplicate publication", "self plagiarism", "preprint servers", "arxiv ' +
    'biorxiv", "embargo period", "green vs gold oa", "creative commons license", "transformative ' +
    'agreement", "plan s", "orcid identifier", "doi crossref", "scopus web of science", "google ' +
    'scholar metrics", "altmetrics", "research statement", "teaching statement", "diversity ' +
    'statement", "job talk", "chalk talk", "two body problem", "tenure clock", "tenure ' +
    'portfolio", "external review letters", "adjunct vs lecturer", "soft money", "bridge ' +
    'funding", "nih r01", "nsf career", "erc grant", "marie curie fellowship", "f31 fellowship", ' +
    '"t32 training grant", "k99 r00", "indirect cost rate", "biosketch nih", "effort reporting", ' +
    '"summer salary", "sabbatical leave", "dissertation prospectus", "abd all but dissertation", ' +
    '"candidacy exam", "viva voce defense", "embargo dissertation", "doctorate by publication", ' +
    '"professor of practice", "irb institutional review", "iacuc animal care", "conflict of ' +
    'interest disclosure", "responsible conduct training", "credit taxonomy", "corresponding ' +
    'author", "equal contribution", "individual development plan") — never the literal question ' +
    'phrasing or a bare institution/journal name alone.',
  diy:
    'If the input looks like Home Improvement / DIY SE questions (residential trades — plumbing, ' +
    'residential electrical, drywall, framing, woodworking, HVAC, paint, tile, roofing — "How do I ' +
    'fix …", "Why is my [fixture/wall/floor] …", "What is the best way to [install/replace] …", ' +
    '"Can I [diy task] without [tool/permit]"), distill to the home-improvement concept (e.g. ' +
    '"drywall patching", "stud finder", "circuit breaker", "dripping faucet", "drain snake", ' +
    '"window flashing", "toilet flange", "wood joinery", "deck staining", "grout sealing", ' +
    '"load bearing wall", "subfloor moisture", "pex vs copper", "gfci outlet", "vapor barrier", ' +
    '"joist hangers", "shower diverter", "p trap", "miter joint", "shim leveling", "thinset ' +
    'mortar", "drainage slope", "torque wrench", "nail vs screw", "romex nm cable", "afci ' +
    'breaker", "three way switch", "four way switch", "dimmer compatibility", "doorbell wiring", ' +
    '"panel main breaker", "subpanel feeder", "bonding vs grounding", "ground rod", "service ' +
    'entrance", "copper sweat solder", "sharkbite vs solder", "water hammer arrestor", "expansion ' +
    'tank", "pressure regulator", "ball valve", "check valve", "backflow preventer", "frost free ' +
    'hydrant", "toilet fill valve", "flapper replacement", "wax ring", "shower valve cartridge", ' +
    '"pressure balance valve", "water heater anode rod", "tankless water heater", "joist span ' +
    'tables", "deck ledger flashing", "lag bolt", "deck footings frost line", "sonotube ' +
    'concrete", "treated lumber", "composite decking", "crown molding install", "scribing trim", ' +
    '"coping vs mitering", "pocket hole jig", "biscuit joiner", "mortise and tenon", "dovetail ' +
    'joint", "rabbet joint", "tongue and groove flooring", "click lock laminate", "lvp luxury ' +
    'vinyl", "transition strip", "schluter trim", "ditra membrane", "kerdi waterproof", "backer ' +
    'board cement", "redgard liquid membrane", "large format tile", "caulk vs grout", "silicone ' +
    'vs latex caulk", "drywall texture knockdown", "popcorn ceiling removal", "corner bead ' +
    'types", "paint sheen choice", "semi gloss vs eggshell", "exterior paint elastomeric", "deck ' +
    'stain types") — never the literal question phrasing or a bare brand name alone.',
  scifi:
    'If the input looks like Science Fiction & Fantasy SE questions (speculative-fiction canon, ' +
    'world-building, character analysis, plot logic, in-universe rules — "Why did [character] …", ' +
    '"How does [magic system / FTL / ansible] work in [series]", "What is the difference between ' +
    '[species/factions]", "Is [event] consistent with [established lore]"), distill to the scifi/' +
    'fantasy concept (e.g. "hyperspace travel", "the force jedi", "time travel paradox", ' +
    '"middle earth geography", "asimov three laws", "warp drive star trek", "dune spice melange", ' +
    '"hogwarts houses", "westeros politics", "cyberpunk dystopia", "alien biology", "first ' +
    'contact protocol", "magic system rules", "lightsaber combat forms", "ringworld engineering", ' +
    '"foundation psychohistory", "horcrux soul magic", "ender game tactics", "dystopian society", ' +
    '"space opera tropes", "post apocalyptic fiction", "speculative biology", "alternate history ' +
    'fiction", "deus ex machina", "chosen one trope", "monomyth hero journey", "anti hero ' +
    'protagonist", "soft magic system", "hard magic system", "sandersons laws of magic", ' +
    '"elemental magic", "alcubierre drive", "wormhole travel", "generation ship", "cryogenic ' +
    'stasis", "ansible instantaneous", "dyson sphere", "kardashev scale", "fermi paradox", "drake ' +
    'equation", "great filter", "dark forest theory", "hive mind", "silicon based life", "post ' +
    'biological", "blade runner replicant", "skynet ai", "hal 9000", "novikov self consistency", ' +
    '"branching timelines", "mirror universe", "prime directive federation", "vulcan logic", ' +
    '"klingon honor", "borg assimilation", "q continuum", "kobayashi maru", "jedi vs sith", ' +
    '"force ghost", "midi chlorians", "kyber crystal", "mandalorian creed", "rebel alliance ' +
    'galactic empire", "cosmic horror lovecraft", "elder gods cthulhu", "eldritch abomination", ' +
    '"weird fiction tradition", "vandermeer southern reach", "gibson sprawl", "stephenson snow ' +
    'crash", "neuromancer matrix", "biopunk steampunk", "solarpunk afrofuturism", "octavia ' +
    'butler", "n k jemisin broken earth", "magical realism", "urban fantasy", "grimdark fiction", ' +
    '"abercrombie first law", "hopepunk cozy fantasy", "new weird slipstream", "sword and ' +
    'planet", "military scifi", "post scarcity society", "transhumanism posthuman", "mind ' +
    'uploading") — never the literal question phrasing or a bare title/character name alone.',
  history:
    'If the input looks like History SE questions (academic historiography, ' +
    'primary-source evaluation, period analysis — "Why did [civilization/empire] …", ' +
    '"When did [event] …", "What is the evidence for [claim]", "How reliable is ' +
    '[primary source]"), distill to the historiographical concept (e.g. "roman empire ' +
    'fall", "byzantine succession", "feudal japan shogunate", "industrial ' +
    'revolution", "ottoman empire decline", "thirty years war", "renaissance ' +
    'florence", "ming dynasty", "abbasid caliphate", "carolingian empire", "war of ' +
    'the roses", "spanish reconquista", "han dynasty silk road", "napoleonic wars", ' +
    '"treaty of westphalia", "athenian democracy", "punic wars", "viking expansion", ' +
    '"mongol conquests", "crusades historiography", "primary source analysis", ' +
    '"scholastic period", "magna carta", "americas pre columbian", "feudalism ' +
    'economy", "enlightenment philosophy", "absolutism monarchy", "russian ' +
    'revolution", "french revolution origins", "american revolution causes", ' +
    '"victorian era industrial", "age of exploration", "columbian exchange", ' +
    '"atlantic slave trade", "qing dynasty fall", "edo period japan", "meiji ' +
    'restoration", "samurai class abolition", "mughal empire decline", "tokugawa ' +
    'shogunate", "sui tang transition", "song dynasty economy", "yuan dynasty ' +
    'mongol", "achaemenid persia", "sassanid empire", "parthian rome border", ' +
    '"alexander macedonia conquest", "hellenistic kingdoms", "ptolemaic egypt", ' +
    '"roman republic decline", "julio claudian dynasty", "year of four emperors", ' +
    '"antonine plague impact", "diocletian reforms", "constantine christianity", ' +
    '"justinian reconquest", "plague of justinian", "fall of constantinople", ' +
    '"italian city states", "hanseatic league trade", "holy roman empire structure", ' +
    '"papal schism", "avignon papacy", "council of trent", "peace of augsburg", ' +
    '"glorious revolution", "jacobite risings", "seven years war", "bismarck ' +
    'unification", "italian risorgimento", "austro hungarian compromise", "balkan ' +
    'wars origins", "russo japanese war", "world war one origins", "treaty of ' +
    'versailles", "weimar republic collapse", "manchurian incident", "sino japanese ' +
    'war", "cold war origins", "decolonization africa", "partition of india", "suez ' +
    'crisis", "cuban missile crisis", "vietnam war historiography", "fall of the ' +
    'soviet union", "meiji constitution", "taiping rebellion", "opium wars") — never ' +
    'the literal question phrasing or a bare person/place name alone.',
  gardening:
    'If the input looks like Gardening & Landscaping SE questions (practical ' +
    'horticulture / plant care / soil / pests / pruning / garden design — "Why is my ' +
    '[plant] …", "How do I [prune/fertilize/water] …", "What is wrong with my ' +
    '[leaves/soil/lawn]", "When should I [plant/transplant/harvest]", "Should I ' +
    '[mulch/compost/spray] …"), distill to the horticulture concept (e.g. "soil ph ' +
    'amendments", "tomato blight prevention", "raised bed construction", "companion ' +
    'planting", "compost troubleshooting", "drip irrigation design", "pruning fruit ' +
    'trees", "powdery mildew control", "seed starting indoors", "hardiness zone ' +
    'planning", "mulching benefits", "container vegetable gardening", "perennial ' +
    'division", "lawn renovation", "transplant shock recovery", "aphid pest control", ' +
    '"root bound plants", "nitrogen deficiency", "cover crops", "vegetable rotation", ' +
    '"leaf mold composting", "frost protection", "deadheading flowers", "hardening ' +
    'off seedlings", "soil drainage", "succession planting", "espalier training", ' +
    '"grafting fruit trees", "layering propagation", "taking cuttings", ' +
    '"scarification seeds", "stratification seeds", "vermicomposting worms", "double ' +
    'digging beds", "no dig gardening", "ruth stout method", "hugelkultur beds", ' +
    '"swale construction", "rain garden design", "pollinator garden plants", ' +
    '"beneficial insects garden", "ladybug aphid control", "lacewing biocontrol", ' +
    '"neem oil application", "bordeaux mixture fungicide", "copper spray fungicide", ' +
    '"dormant oil pruning", "spring oil aphid", "slug snail traps", "deer fence ' +
    'options", "vole trap garden", "gopher exclusion", "rabbit deterrent", "container ' +
    'drainage holes", "self watering pot", "tomato cage staking", "indeterminate ' +
    'determinate tomato", "cucumber trellis", "pole vs bush bean", "trellising peas", ' +
    '"garlic planting fall", "onion sets vs seed", "potato hilling", "sweet potato ' +
    'slips", "asparagus crown planting", "rhubarb division", "strawberry runner ' +
    'removal", "blueberry soil acidification", "raspberry cane management", ' +
    '"blackberry trellising", "grape vine pruning", "fig winter protection", "citrus ' +
    'container indoor", "orchid potting media", "bonsai wiring technique", "rose ' +
    'blackspot management", "hydrangea ph color", "lavender pruning method", "hosta ' +
    'slug damage", "japanese maple care", "boxwood blight symptoms", "dahlia tuber ' +
    'storage", "gladiolus corm overwinter", "bulb forcing indoors", "amaryllis bloom ' +
    'care") — never the literal question phrasing or a bare plant/brand name alone.',
  chess:
    'If the input looks like Chess SE questions (chess theory / openings / middlegame ' +
    '/ endgame / tactics / rules / engine analysis — "Why does [white/black] play …", ' +
    '"How should I respond to [opening] …", "What is the best move in [position]", ' +
    '"Is [variation] sound", "How do I win [endgame] …", "When should I ' +
    '[castle/trade/sacrifice] …"), distill to the chess concept (e.g. "sicilian ' +
    'najdorf", "ruy lopez theory", "king\'s indian defense", "queen\'s gambit ' +
    'declined", "french defense", "caro kann", "english opening", "endgame ' +
    'opposition", "rook pawn endgames", "lucena position", "philidor position", ' +
    '"isolated queen pawn", "hanging pawns", "minority attack", "fork pin skewer", ' +
    '"discovered check", "double attack tactics", "zugzwang endgames", "zwischenzug ' +
    'tactics", "positional sacrifice", "pawn structure", "piece activity", "king ' +
    'safety", "elo rating system", "fide tournament rules", "chess engine analysis", ' +
    '"blitz time controls", "castling rules", "en passant rule", "fischer random ' +
    'chess960", "capablanca endgame technique", "tactical motifs", "italian game ' +
    'variations", "scotch opening", "vienna game", "kings gambit", "evans gambit", ' +
    '"danish gambit", "alekhine defense", "pirc defense", "modern defense", ' +
    '"scandinavian center counter", "benoni defense", "dutch stonewall", "dutch ' +
    'leningrad", "grunfeld defense", "nimzo indian defense", "queens indian defense", ' +
    '"bogo indian", "catalan opening", "slav defense", "semi slav defense", "london ' +
    'system", "colle system", "trompowsky attack", "torre attack", "reti opening", ' +
    '"kings indian attack", "larsen opening", "sokolsky orangutan", "najdorf english ' +
    'attack", "dragon yugoslav attack", "taimanov sicilian", "scheveningen sicilian", ' +
    '"sveshnikov sicilian", "kan sicilian", "accelerated dragon", "smith morra ' +
    'gambit", "alapin sicilian", "closed sicilian", "exchange ruy lopez", "berlin ' +
    'defense", "marshall attack", "fishing pole tactic", "greek gift sacrifice", ' +
    '"fianchetto bishop", "opposite side castling attack", "pawn race endgame", ' +
    '"queen vs pawn endgame", "knight vs bishop endgame", "bishop pair advantage", ' +
    '"wrong color bishop", "perpetual check draw", "fifty move rule", "threefold ' +
    'repetition", "stalemate trick") — never the literal question phrasing or a bare ' +
    'player/game name alone.',
  movies:
    'If the input looks like Movies & TV SE questions (film canon / narrative ' +
    'analysis / cinematography / direction / production / continuity / genre — "Why ' +
    'does [character] …", "What does [scene/symbol] mean", "Is [plot detail] a ' +
    'reference to …", "How was [shot/effect] achieved", "Why did [director] choose ' +
    '…"), distill to the cinema concept (e.g. "auteur theory", "three act structure", ' +
    '"kuleshov effect", "dolly zoom shot", "long take cinematography", "chiaroscuro ' +
    'lighting", "miyazaki animation", "kurosawa composition", "hitchcock suspense", ' +
    '"french new wave", "italian neorealism", "dogme 95 movement", "hero\'s journey ' +
    'narrative", "unreliable narrator film", "non linear storytelling", "mise en ' +
    'scene", "montage editing", "diegetic sound", "foley sound design", "studio ' +
    'system hollywood", "hays code era", "method acting tradition", "screenplay ' +
    'structure", "cinematography blocking", "production design", "color grading ' +
    'film", "sound design narrative", "establishing shot grammar", "match on action ' +
    'editing", "film noir", "silent era cinema", "stop motion animation", "practical ' +
    'effects vs cgi", "wes anderson symmetry", "tarantino dialogue", "scorsese ' +
    'tracking shots", "kubrick framing", "spielberg blocking", "fincher precision", ' +
    '"malick poetic voiceover", "lynch surrealism", "von trier dogme", "bergman ' +
    'intimate close ups", "fellini magical realism", "antonioni alienation", "godard ' +
    'jump cuts", "truffaut humanism", "varda essay film", "ozu tatami shot", ' +
    '"mizoguchi long take", "ray apu trilogy", "satyajit ray neorealism", "almodovar ' +
    'melodrama", "pedro almodovar color", "denis villeneuve scope", "christopher ' +
    'nolan timeline", "paul thomas anderson tracking", "coen brothers dark comedy", ' +
    '"the new hollywood", "blockbuster era", "summer tentpole release", "indie film ' +
    'festival", "sundance circuit", "cannes palme dor", "oscars best picture", ' +
    '"golden age musicals", "screwball comedy", "slapstick silent", "pre code ' +
    'hollywood", "b movie tradition", "exploitation cinema", "blaxploitation films", ' +
    '"italian giallo", "hong kong action wuxia", "japanese chanbara", "korean wave ' +
    'cinema", "bollywood masala film", "telugu blockbuster", "world cinema", "dogma ' +
    'manifesto", "mumblecore aesthetic", "found footage horror", "slasher genre ' +
    'rules", "kaiju city scale", "body horror cronenberg", "social issue ' +
    'documentary", "mockumentary technique") — never the literal question phrasing or ' +
    'a bare film/actor name alone.',
  boardgames:
    'If the input looks like Board & Card Games SE questions (tabletop strategy / ' +
    'euro / wargame / abstract / deck-builder / rules-arbitration / component design ' +
    '— "Why is [mechanic] balanced", "How does [card/rule] interact with …", "What is ' +
    'the optimal strategy for [game]", "Is [edge case] resolved by …", "How should I ' +
    'open in [game]", "When can I [trade/build/attack] …"), distill to the ' +
    'tabletop-game concept (e.g. "euro game design", "worker placement mechanic", ' +
    '"deck building strategy", "area control wargame", "auction bidding mechanic", ' +
    '"tile laying games", "rondel mechanism", "action point allowance", "drafting ' +
    'mechanic", "engine building", "asymmetric factions", "victory point salad", ' +
    '"kingmaker problem", "analysis paralysis", "catan opening strategy", ' +
    '"carcassonne tile placement", "ticket to ride routes", "agricola farm ' +
    'management", "puerto rico role selection", "twilight imperium grand strategy", ' +
    '"terraforming mars engine", "wingspan combos", "scythe asymmetric power", ' +
    '"gloomhaven campaign", "pandemic cooperative", "magic the gathering mana curve", ' +
    '"commander format edh", "limited draft theory", "go fuseki opening", "shogi ' +
    'castle", "backgammon pip count", "poker pot odds", "bridge bidding convention", ' +
    '"monopoly auction rule", "chess clock time control", "dungeons dragons combat", ' +
    '"ameritrash thematic", "dudes on a map", "dexterity flick game", "social ' +
    'deduction werewolf", "hidden role secret hitler", "betrayal traitor mechanic", ' +
    '"legacy game persistent", "pandemic legacy season", "risk legacy mechanic", ' +
    '"charterstone progression", "gloomhaven jaws of lion", "mansions of madness ' +
    'app", "descent imperial assault", "x wing miniatures", "warhammer 40k list ' +
    'building", "magic standard rotation", "modern format mtg", "legacy vintage power ' +
    'nine", "pauper magic budget", "draft pod table", "sealed deck format", ' +
    '"commander 100 card singleton", "brawl format mtg", "pioneer format mtg", ' +
    '"hearthstone mana curve", "legends of runeterra spellmana", "gwent witcher ' +
    'card", "dominion deckbuild", "ascension deckbuilder", "star realms shipyard", ' +
    '"marvel champions hero deck", "lord of the rings lcg", "arkham horror lcg", "ki ' +
    'goh igo", "shogi promotion zones", "xiangqi chinese chess", "mahjong tile sets", ' +
    '"gin rummy melds", "hearts shooting moon", "spades partnership bidding", "euchre ' +
    'trump call", "cribbage pegging", "scrabble bingo bonus", "rummikub set runs", ' +
    '"settlers expansion seafarers", "terra mystica race choice", "brass birmingham ' +
    'network", "gaia project planet", "eclipse galactic combat", "twilight struggle ' +
    'cold war", "war of the ring fellowship", "root asymmetric forest") — never the ' +
    'literal question phrasing or a bare game/component name alone.',
  workplace:
    'If the input looks like Workplace SE questions (career / professional norms / ' +
    'management / office politics / hiring / compensation / remote work / interview ' +
    'prep — "How do I tell my manager …", "Should I quit if …", "Is it appropriate to ' +
    '…", "How should I respond when [colleague/boss] …", "What is the best way to ask ' +
    'for [raise/promotion/feedback]"), distill to the workplace concept (e.g. "salary ' +
    'negotiation tactics", "performance review preparation", "giving notice ' +
    'professionally", "managing up effectively", "remote work etiquette", "code ' +
    'switching at work", "imposter syndrome career", "career pivot strategy", ' +
    '"informational interview", "behavioral interview star method", "technical ' +
    'interview preparation", "team lead transition", "individual contributor track", ' +
    '"management track promotion", "1on1 meeting framework", "constructive feedback ' +
    'delivery", "difficult conversations workplace", "workplace conflict resolution", ' +
    '"office politics navigation", "asynchronous communication remote", "deep work ' +
    'scheduling", "context switching cost", "burnout prevention", "work life ' +
    'balance", "compensation benchmarking", "stock option vesting", "bonus structure ' +
    'negotiation", "exit interview etiquette", "non compete clause", "professional ' +
    'reference request", "linkedin profile optimization", "elevator pitch crafting", ' +
    '"mentorship relationship", "psychological safety team", "radical candor ' +
    'framework", "okrs goal setting", "kpi vs okr", "smart goal framework", "balanced ' +
    'scorecard strategy", "situational leadership", "servant leadership style", ' +
    '"transformational leadership", "lead from behind", "lead by example", "agile ' +
    'scrum master", "kanban board flow", "sprint retrospective", "sprint planning ' +
    'meeting", "daily standup format", "post mortem blameless", "retro action items", ' +
    '"hiring loop design", "take home assignment", "technical screen call", "system ' +
    'design interview", "behavioral screen recruiter", "reference check process", ' +
    '"offer letter negotiation", "signing bonus negotiation", "equity refresh grant", ' +
    '"restricted stock units", "iso vs nso option", "409a valuation", "secondary ' +
    'stock sale", "tender offer event", "dilution funding round", "pip performance ' +
    'improvement plan", "last day handover", "knowledge transfer document", "bus ' +
    'factor risk", "pair programming sessions", "code review etiquette", ' +
    '"asynchronous standup", "all hands meeting cadence", "town hall communication", ' +
    '"skip level meeting", "succession planning lead", "dei diversity equity", ' +
    '"accommodation request workplace", "harassment hr complaint", "retaliation ' +
    'protection law", "garden leave clause", "severance package negotiation", "cobra ' +
    'health insurance", "fmla family leave", "parental leave policy", "return to ' +
    'office mandate") — never the literal question phrasing or a bare person/company ' +
    'name alone.',
  parenting:
    'If the input looks like Parenting SE questions (child development / discipline / ' +
    'family dynamics / education choices / sleep / feeding / behavior / co-parenting ' +
    '— "How do I get my [age] year old to …", "Is it normal for my child to …", "How ' +
    'should I respond when my [toddler/teen] …", "Should I let my child …", "What is ' +
    'the best way to handle [tantrum/fight/refusal] …", "When should I be concerned ' +
    'about …"), distill to the parenting concept (e.g. "attachment parenting theory", ' +
    '"authoritative parenting style", "permissive parenting effects", "positive ' +
    'discipline framework", "natural consequences method", "time out effectiveness", ' +
    '"screen time limits", "sleep training methods", "cry it out method", "ferber ' +
    'method sleep", "cosleeping safety", "nap transition timing", "extended ' +
    'breastfeeding", "baby led weaning", "picky eating strategies", "potty training ' +
    'readiness", "toddler tantrums", "sibling rivalry resolution", "only child ' +
    'socialization", "blended family dynamics", "co parenting after divorce", "step ' +
    'parent boundaries", "homeschool curriculum choice", "montessori method home", ' +
    '"waldorf education", "reggio emilia approach", "free range parenting", ' +
    '"helicopter parenting effects", "tiger parenting culture", "executive function ' +
    'development", "emotion coaching method", "growth mindset parenting", "teen ' +
    'autonomy negotiation", "screen addiction adolescent", "social media limits ' +
    'teen", "puberty conversation timing", "allowance and chores", "newborn sleep ' +
    'schedule", "fourth trimester support", "safe sleep abc", "tummy time ' +
    'importance", "wake window infant", "circadian rhythm baby", "iron deficiency ' +
    'infant", "vitamin d supplementation", "developmental milestones tracker", ' +
    '"speech delay concerns", "fine motor skills", "gross motor development", ' +
    '"bilingual home strategy", "one parent one language", "reading aloud benefits", ' +
    '"phonics vs whole word", "sensory processing differences", "autism early signs", ' +
    '"adhd diagnostic criteria", "dyslexia screening early", "occupational therapy ' +
    'pediatric", "iep individualized plan", "504 plan accommodations", "twice ' +
    'exceptional gifted", "childhood anxiety treatment", "school refusal causes", ' +
    '"bullying intervention", "cyberbullying response", "first phone age", ' +
    '"smartphone contract teen", "video game limits", "online safety talk", "consent ' +
    'education young", "body autonomy teaching", "rear facing car seat", "booster ' +
    'seat law", "bike helmet fitting", "vaccine schedule pediatric", "fever ' +
    'management infant", "well visit checklist", "dental care toddler", "thumb ' +
    'sucking weaning", "pacifier weaning timing", "bedwetting management") — never ' +
    'the literal question phrasing or a bare child/family-member name alone.',
  anime:
    'If the input looks like Anime & Manga SE questions (anime / manga / light novel ' +
    '/ studio / genre / arc / tropes / production craft — "Why does [character] …", ' +
    '"What episode is …", "Is [event] in the manga", "What does the kanji for [name] ' +
    'mean", "How does [arc] differ from the source"), distill to the anime/manga ' +
    'concept (e.g. "shonen genre tropes", "seinen storytelling", "shojo romance ' +
    'conventions", "isekai genre", "mecha anime tradition", "slice of life pacing", ' +
    '"iyashikei healing genre", "sakuga animation", "studio ghibli craft", "madhouse ' +
    'studio style", "kyoto animation aesthetic", "trigger studio kinetic", "shaft ' +
    'head tilt", "hayao miyazaki films", "isao takahata realism", "satoshi kon ' +
    'montage", "hideaki anno deconstruction", "masaaki yuasa fluidity", "mamoru ' +
    'hosoda family", "naoko yamada framing", "shinkai makoto melodrama", "akira ' +
    'toriyama art", "tezuka osamu manga godfather", "shonen jump weekly", "battle ' +
    'shonen power scaling", "manga panel composition", "paneling rhythm manga", ' +
    '"manga to anime adaptation", "filler arc anime", "ova vs tv series", "anime ' +
    'original ending", "light novel adaptation", "isekai cheat protagonist", "power ' +
    'of friendship trope", "tournament arc structure", "training arc convention", ' +
    '"opening sequence symbolism", "ending sequence motifs", "voice acting seiyuu", ' +
    '"fansub culture", "scanlation ethics", "shonen demographic", "seinen ' +
    'demographic", "magical girl genre", "cyberpunk anime", "post apocalyptic anime", ' +
    '"psychological anime", "production committee model", "anime production ' +
    'pipeline", "key animation in between", "limited animation tradition", "tv anime ' +
    'budget constraints", "studio sunrise mecha", "ufotable rotoscope", "wit studio ' +
    'cinematic", "mappa studio output", "bones studio fight choreography", "pierrot ' +
    'studio shonen", "toei animation legacy", "production ig cyberpunk", "polygon ' +
    'pictures cgi", "orange studio cgi", "key animator credit", "douga in between ' +
    'artist", "art director background", "color designer anime", "compositor digital ' +
    'anime", "ev cel paint era", "digital paint transition", "rotoscope eva", "hand ' +
    'drawn 2d preservation", "anime music composer", "yoko kanno score", "yuki ' +
    'kajiura motif", "kenji kawai score", "joe hisaishi ghibli", "anime opening ' +
    'band", "tie in idol song", "ova bonus episode", "short series 12 episodes", ' +
    '"split cour anime", "delayed broadcast late night", "noitamina time slot", ' +
    '"morning shonen vs late night", "anime catch up streaming", "crunchyroll ' +
    'simulcast", "netflix exclusive anime") — never the literal question phrasing or ' +
    'a bare character/show name alone.',
  hermeneutics:
    'If the input looks like Biblical Hermeneutics SE questions (textual criticism / ' +
    'exegesis / comparative theology / source-form criticism / patristics / midrash / ' +
    'hadith methodology / translation analysis — "What does the Greek/Hebrew of ' +
    '[verse] mean", "How did early church fathers interpret …", "Is [doctrine] ' +
    'supported by …", "How does [tradition] read [passage]"), distill to the ' +
    'hermeneutic / scriptural-scholarship concept (e.g. "biblical textual criticism", ' +
    '"documentary hypothesis", "synoptic problem", "q source theory", "historical ' +
    'jesus methodology", "form criticism", "source criticism", "redaction criticism", ' +
    '"narrative criticism scripture", "canonical criticism", "patristic exegesis", ' +
    '"alexandrian school allegory", "antiochene literal interpretation", "midrash ' +
    'tradition", "talmudic reasoning", "halakhic methodology", "aggadic ' +
    'interpretation", "hadith authentication", "isnad chain methodology", "matn ' +
    'analysis", "tafsir traditions", "asbab al nuzul context", "hebrew bible canon", ' +
    '"septuagint translation", "vulgate translation", "masoretic text", "dead sea ' +
    'scrolls", "nag hammadi library", "deuterocanonical books", "pseudepigrapha", ' +
    '"apocrypha new testament", "early church fathers", "augustine hermeneutic", ' +
    '"origen allegory", "thomas aquinas exegesis", "lutheran sola scriptura", ' +
    '"reformed covenant theology", "dispensationalism framework", "liberation ' +
    'theology hermeneutic", "feminist biblical interpretation", "narrative theology", ' +
    '"second temple judaism", "intertestamental period", "samaritan pentateuch", ' +
    '"targum aramaic translation", "peshitta syriac", "diatessaron tatian", "codex ' +
    'sinaiticus", "codex vaticanus", "codex alexandrinus", "papyri new testament", ' +
    '"p66 papyrus bodmer", "p46 papyrus pauline", "majority text byzantine", ' +
    '"alexandrian text type", "western text type", "eclectic text method", "reasoned ' +
    'eclecticism", "ehrman misquoting jesus", "metzger textual commentary", ' +
    '"tischendorf discoveries", "westcott hort theory", "comma johanneum", "pericope ' +
    'adulterae", "longer ending mark", "lukan birth narrative", "matthean genealogy", ' +
    '"johannine prologue", "pauline pseudepigrapha debate", "deutero pauline ' +
    'epistles", "pastoral epistles authorship", "petrine authorship debate", "jude ' +
    'enochic citation", "book of enoch reception", "jubilees second temple", "wisdom ' +
    'of solomon", "ben sira sirach", "tobit narrative", "judith hellenistic story", ' +
    '"maccabees deuterocanon", "septuagint psalter numbering", "isaiah scroll ' +
    'qumran", "habakkuk pesher") — never the literal question phrasing or a bare ' +
    'verse reference alone.',
  bicycles:
    'If the input looks like Bicycles SE questions (drivetrain / gearing / wheels / ' +
    'frames / maintenance / touring / commuting / road / gravel / mountain / fitting ' +
    '— "How do I adjust my [derailleur/brakes]", "What gear ratio for …", "Is my ' +
    '[chain/cassette] worn", "How to fit a …"), distill to the cycling concept (e.g. ' +
    '"gear ratio selection", "cadence vs power training", "drivetrain wear", "chain ' +
    'wear measurement", "cassette compatibility", "11 speed vs 12 speed", "mechanical ' +
    'vs hydraulic disc brakes", "rim brake setup", "tubeless tire setup", "tire ' +
    'pressure rolling resistance", "wheel building basics", "spoke tension", "wheel ' +
    'truing", "frame geometry road", "endurance vs racing geometry", "gravel bike ' +
    'geometry", "mountain bike suspension", "hardtail vs full suspension", "26 vs 29 ' +
    'wheel size", "650b plus tires", "bottom bracket standards", "headset standards", ' +
    '"1x vs 2x drivetrain", "groupset hierarchy shimano", "sram axs wireless", ' +
    '"campagnolo legacy", "bike fit saddle height", "knee over pedal spindle", "cleat ' +
    'positioning", "saddle setback", "handlebar reach drop", "stack and reach", ' +
    '"indoor trainer types", "smart trainer power", "power meter accuracy", "ftp test ' +
    'protocol", "training zones", "bikepacking gear", "front panniers vs rear", ' +
    '"randonneuring tradition", "audax brevet", "fixed gear urban", "track cycling", ' +
    '"cyclocross technique", "chain lubrication wax vs oil", "wax chain immersion", ' +
    '"chain stretch checker", "park tool chain checker", "chainline optimization", ' +
    '"12 speed chain narrow", "quick link master link", "shimano hyperglide plus", ' +
    '"campy ekar gravel", "sram red etap axs", "shimano di2 wireless", "electronic ' +
    'shifting battery", "tubeless sealant top up", "tubeless tire installation", ' +
    '"hookless rim ready", "tan wall tire trend", "tire casing tpi", "plush tire low ' +
    'pressure", "wide tire road trend", "aero road bike", "all road bike category", ' +
    '"endurance bike compliance", "compliance flex pivot", "isospeed decoupler", ' +
    '"gravel suspension fork", "gravel dropper post", "internal cable routing aero", ' +
    '"headset cable routing aesthetic", "press fit bottom bracket creak", "threaded ' +
    'bb", "t47 bottom bracket", "creak diagnosis bb", "carbon frame failure mode", ' +
    '"steel frame longevity", "titanium frame ride quality", "aluminum frame ' +
    'fatigue", "bicycle commuting clothing", "lights see vs be seen") — never the ' +
    'literal question phrasing or a bare component/brand name alone.',
  japanese:
    'If the input looks like Japanese Language SE questions (kanji / kana / grammar / ' +
    'particles / keigo / dialect / reading / etymology / nuance — "What does [word] ' +
    'mean", "How is [particle] used", "Why is [verb form] in the …", "What is the ' +
    'difference between [X] and [Y]"), distill to the Japanese-language concept (e.g. ' +
    '"kanji etymology", "joyo kanji list", "jukugo compounds", "onyomi kunyomi ' +
    'readings", "rendaku voicing", "okurigana rules", "hiragana origins", "katakana ' +
    'usage", "wago vs kango", "particle wa vs ga", "particle wo vs ni", "particle de ' +
    'location", "particle made limit", "te form usage", "masu form polite", "plain ' +
    'form casual", "keigo respectful language", "sonkeigo respect", "kenjougo ' +
    'humble", "teineigo polite", "passive vs causative", "transitive intransitive ' +
    'pairs", "godan ichidan verbs", "irregular verbs suru kuru", "i adjective ' +
    'conjugation", "na adjective copula", "potential form", "conditional tara nara", ' +
    '"conditional eba", "presumptive darou deshou", "volitional ou you", "imperative ' +
    'form", "negative nai zu", "giving receiving ageru kureru morau", "dialect kansai ' +
    'ben", "tohoku dialect", "okinawan language", "old japanese classical", "kanbun ' +
    'chinese reading", "manyogana", "edo period language", "loanwords gairaigo", ' +
    '"wasei eigo", "onomatopoeia gitaigo", "honorific suffixes san kun chan", ' +
    '"company titles bucho kacho", "kanji stroke order", "radical bushu", "kanji ' +
    'frequency list", "n5 n4 n3 n2 n1 jlpt", "jlpt vocabulary list", "wanikani srs ' +
    'method", "anki core 10k deck", "rtk heisig method", "kanji mnemonic visual", ' +
    '"phonetic component kanji", "semantic radical role", "kun yomi nuance", "on yomi ' +
    'tang sound", "go on kan on tou on", "ateji phonetic kanji", "jukujikun irregular ' +
    'reading", "noun of cha tea", "long vowel chouon", "double consonant sokuon", ' +
    '"small tsu pause", "particle no possessive", "particle no nominalizer", ' +
    '"particle to quotation", "particle ya listing", "particle nado etcetera", ' +
    '"particle dake only", "particle shika negative", "particle bakari just", ' +
    '"particle hodo extent", "te wa ikenai prohibition", "nakereba naranai ' +
    'obligation", "te mo ii permission", "te miru attempt", "te shimau regret", "te ' +
    'oku preparation", "te aru passive state", "te iru ongoing state", "naru change ' +
    'of state", "suru cause to be", "tsumori intention", "rashii hearsay") — never ' +
    'the literal question phrasing or a bare word/character alone.',
  quant:
    'If the input looks like Quantitative Finance SE questions (mathematical / ' +
    'computational finance — derivatives pricing, stochastic calculus, risk models, ' +
    'portfolio theory, algorithmic trading, market microstructure, fixed income, ' +
    'volatility surfaces, factor investing — "How do I price …", "What model ' +
    'captures …", "Why does my [VaR/greek/calibration] …", "How do I hedge …", "What ' +
    'is the difference between [model] and [model]"), distill to the ' +
    'quantitative-finance concept (e.g. "black scholes pricing", "binomial tree ' +
    'option", "monte carlo simulation finance", "stochastic volatility heston", ' +
    '"local volatility dupire", "implied volatility surface", "volatility smile", ' +
    '"greeks delta gamma vega theta", "value at risk", "expected shortfall", "credit ' +
    'valuation adjustment", "interest rate term structure", "hull white model", ' +
    '"vasicek model", "cir model", "libor market model", "swap curve construction", ' +
    '"yield curve bootstrapping", "duration convexity bond", "credit default swap ' +
    'pricing", "structural model merton", "reduced form intensity", "copula ' +
    'dependency", "gaussian copula cdo", "portfolio optimization markowitz", ' +
    '"efficient frontier theory", "capm beta", "fama french factors", "smart beta ' +
    'investing", "risk parity portfolio", "kelly criterion sizing", "black litterman ' +
    'model", "mean variance optimization", "stochastic differential equations", "ito ' +
    'calculus", "girsanov theorem", "martingale measure", "risk neutral pricing", ' +
    '"feynman kac formula", "brownian motion finance", "ornstein uhlenbeck process", ' +
    '"jump diffusion merton", "levy process pricing", "market making spread", "limit ' +
    'order book dynamics", "high frequency trading microstructure", "statistical ' +
    'arbitrage", "pairs trading cointegration", "garch volatility model", ' +
    '"stochastic discount factor", "no arbitrage condition", "fundamental theorem ' +
    'asset pricing", "complete incomplete markets", "asian option averaging", ' +
    '"barrier option knock in out", "lookback option floating", "chooser option", ' +
    '"compound option on option", "swaption pricing", "cms swap rate", "inflation ' +
    'linked bond", "tips real rate", "convexity adjustment futures", "futures ' +
    'forward bias", "wiener process variance", "geometric brownian motion gbm", ' +
    '"mean reverting ornstein", "heath jarrow morton hjm", "bgm libor model brace", ' +
    '"two factor short rate", "affine term structure", "negative interest rates ' +
    'handling", "cliquet option ratchet", "variance swap fair strike", "vix futures ' +
    'basis", "dispersion trading vol", "carry roll down bond", "principal component ' +
    'yield curve", "pca factor risk", "rfr sofr ester sonia", "ibor transition ' +
    'discount") — never the literal question phrasing or a bare ticker/symbol alone.',
  linguistics:
    'If the input looks like Linguistics SE questions (general linguistics across all human ' +
    'languages — phonetics / phonology / morphology / syntax / semantics / pragmatics / ' +
    'historical linguistics / sociolinguistics / typology / language acquisition / cognitive ' +
    'linguistics — "Why do languages …", "How is [phoneme/morpheme/construction] realized in ' +
    '[language family]", "What is the difference between [accusative/ergative]", "How did ' +
    '[word/sound] evolve from …"), distill to the linguistics concept (e.g. "international ' +
    'phonetic alphabet", "phoneme allophone distinction", "minimal pairs phonology", "vowel ' +
    'space formants", "consonant place manner", "voicing distinction", "tone languages", ' +
    '"prosody intonation", "syllable structure phonotactics", "stress accent typology", ' +
    '"morpheme types", "inflectional vs derivational morphology", "agglutinative isolating ' +
    'fusional", "polysynthetic languages", "ergative absolutive alignment", "nominative ' +
    'accusative alignment", "split ergativity", "case system typology", "grammatical gender", ' +
    '"noun classifiers", "verb aspect", "tense aspect mood", "evidentiality grammar", ' +
    '"voice passive antipassive", "valency changing operations", "constituency phrase structure", ' +
    '"dependency grammar", "x bar theory", "minimalist program syntax", "head directionality ' +
    'parameter", "wh movement", "binding theory", "control raising", "semantic roles theta", ' +
    '"truth conditional semantics", "model theoretic semantics", "compositional semantics", ' +
    '"montague grammar", "scope ambiguity", "presupposition projection", "implicature gricean", ' +
    '"speech act theory", "deixis indexicality", "discourse relations", "indo european reconstruction", ' +
    '"comparative method", "grimm law sound shift", "great vowel shift", "creole pidgin ' +
    'languages", "language contact convergence", "lexical diffusion", "wave model dialect", ' +
    '"sociolinguistic variation", "code switching bilingualism", "language acquisition critical ' +
    'period", "first language acquisition", "second language acquisition", "universal grammar ' +
    'chomsky", "linguistic relativity", "sapir whorf hypothesis", "construction grammar", ' +
    '"prototype theory categories", "metaphor cognitive", "frame semantics", "computational ' +
    'linguistics nlp", "corpus linguistics") — never the literal question phrasing or a bare ' +
    'language name alone.',
  rpg:
    'If the input looks like Role-playing Games SE questions (tabletop RPGs / system mastery / ' +
    'rules arbitration / character optimization / GM craft / module design / campaign craft — ' +
    '"How does [class/spell/ability] work in [system]", "What is the optimal build for …", ' +
    '"Can my [class] use [item] when …", "How do I run [encounter type]", "Is [combo] balanced", ' +
    '"How do I handle [problem player/scenario] as GM"), distill to the TTRPG concept (e.g. ' +
    '"d20 system mechanics", "dnd 5e core rules", "pathfinder 2e action economy", "old school ' +
    'renaissance osr", "narrative dice systems", "powered by the apocalypse", "blades in the ' +
    'dark moves", "fate core aspects", "savage worlds bennies", "gurps point buy", "world of ' +
    'darkness storyteller", "vampire the masquerade clans", "call of cthulhu sanity", "shadowrun ' +
    'matrix", "starfinder spaceships", "warhammer 40k rpg", "monster of the week mystery", ' +
    'character optimization build", "multiclass dipping dnd", "feat tax 5e", "spell slot ' +
    'economy", "concentration spell stacking", "action surge nova", "sneak attack triggers", ' +
    'paladin smite optimization", "wizard subclass evocation", "warlock pact magic", ' +
    '"sorcerer metamagic", "rogue cunning action", "bard inspiration", "cleric domain", ' +
    '"druid wild shape", "ranger favored enemy", "barbarian rage", "fighter battle master", ' +
    '"monk ki points", "encounter design budget", "challenge rating accuracy", "milestone vs ' +
    'xp leveling", "session zero expectations", "safety tools rpg", "lines and veils", "x card ' +
    'system", "open table west marches", "sandbox campaign design", "railroading versus agency", ' +
    '"narrative versus simulation", "rule of cool", "house rules variant", "homebrew balance", ' +
    '"playtest feedback", "module conversion edition", "dungeon design philosophy", "hex ' +
    'crawl exploration", "pointcrawl wilderness", "domain play endgame", "downtime activities", ' +
    '"gritty realism resting", "theater of the mind", "battlemap tactical", "virtual tabletop ' +
    'roll20", "foundry vtt modules", "dice probability anydice", "expected damage calculation", ' +
    '"power gaming versus roleplay", "session prep techniques", "gm screen utility", "improv ' +
    'gm tools", "npc voicing", "faction reputation tracking", "mystery design clue") — never ' +
    'the literal question phrasing or a bare class/spell/system name alone.',
  matheducators:
    'If the input looks like Mathematics Educators SE questions (PEDAGOGY of math, NOT pure math — ' +
    'curriculum design, classroom dynamics, proof literacy, problem-based learning, math anxiety, ' +
    'assessment, K-12 vs undergraduate teaching, student misconceptions — "How do I teach …", ' +
    '"What is the best way to introduce …", "How do students typically misunderstand …", "What is ' +
    'a good problem to motivate …"), distill to the math-pedagogy concept (e.g. "concept of proof", ' +
    '"discovery learning math", "inquiry based learning", "problem based learning math", "flipped ' +
    'classroom calculus", "active learning lecture", "peer instruction physics", "think pair share", ' +
    '"student misconceptions algebra", "fraction misconceptions", "negative number intuition", ' +
    '"variable as unknown", "function concept image", "limit concept image", "infinity intuition", ' +
    '"zero division misconception", "order of operations pedagogy", "long division algorithm", ' +
    '"standard algorithm fluency", "manipulatives elementary", "base ten blocks", "fraction strips", ' +
    '"algebra tiles teaching", "geoboard geometry", "dynamic geometry software", "geogebra ' +
    'classroom", "desmos teacher", "graphing calculator pedagogy", "computer algebra system ' +
    'teaching", "spreadsheet math instruction", "common core standards", "math wars debate", ' +
    '"new math reform", "back to basics curriculum", "singapore math approach", "japanese lesson ' +
    'study", "mathematical knowledge for teaching", "specialized content knowledge", "horizon ' +
    'content knowledge", "pedagogical content knowledge", "math anxiety reduction", "stereotype ' +
    'threat math", "growth mindset math", "productive struggle classroom", "wait time questioning", ' +
    '"socratic questioning math", "real world contexts math", "modeling cycle teaching", "three act ' +
    'tasks", "low floor high ceiling", "open ended problems", "rich tasks math", "formative ' +
    'assessment math", "summative assessment math", "diagnostic assessment math", "rubric ' +
    'mathematics", "writing in mathematics", "proof writing pedagogy", "transition to proof ' +
    'course", "discrete math freshman", "calculus reform", "calculus first semester", "linear ' +
    'algebra teaching", "abstract algebra pedagogy", "real analysis introduction", "topology ' +
    'first course", "history of mathematics teaching", "ethnomathematics curriculum", "gender gap ' +
    'mathematics", "equity math classroom", "differentiated instruction math", "tracking ability ' +
    'grouping", "homeschool math curriculum", "math olympiad training", "math circles", "ross ' +
    'program", "putnam preparation") — never the literal question phrasing or a bare topic name alone.',
  softwareengineering:
    'If the input looks like Software Engineering SE questions (ARCHITECTURE / DESIGN / METHODOLOGY, ' +
    'NOT working code — design patterns, separation of concerns, modeling, requirements, agile, ' +
    'testing strategy, refactoring philosophy, system design, organizational dynamics — "What is ' +
    'the best way to architect …", "Should I use [pattern X] or [pattern Y]", "How do I model …", ' +
    '"What is the difference between [paradigm] and [paradigm]", "Is [practice] considered good ' +
    'engineering"), distill to the design / methodology concept (e.g. "domain driven design", ' +
    '"bounded context modeling", "ubiquitous language", "aggregate root pattern", "event sourcing ' +
    'pattern", "cqrs separation", "hexagonal architecture", "ports and adapters", "clean ' +
    'architecture", "onion architecture", "layered architecture", "monolith versus microservices", ' +
    '"service oriented architecture", "event driven architecture", "message bus pattern", "saga ' +
    'pattern distributed", "circuit breaker pattern", "bulkhead isolation", "anti corruption layer", ' +
    '"strangler fig migration", "dependency injection inversion", "single responsibility principle", ' +
    '"open closed principle", "liskov substitution principle", "interface segregation principle", ' +
    '"dependency inversion principle", "solid principles", "dry don\'t repeat yourself", "kiss keep ' +
    'it simple", "yagni you ain\'t gonna need it", "law of demeter", "tell don\'t ask", "command ' +
    'query separation", "value object pattern", "entity pattern", "factory pattern design", ' +
    '"strategy pattern", "observer pattern", "decorator pattern", "adapter pattern design", ' +
    '"facade pattern", "template method pattern", "visitor pattern", "composite pattern", ' +
    '"functional vs object oriented", "immutable data structures", "pure functions design", ' +
    '"side effect management", "monad pattern", "type driven design", "parse don\'t validate", ' +
    '"making illegal states unrepresentable", "test driven development tdd", "behavior driven ' +
    'development bdd", "acceptance test driven", "outside in tdd", "london school chicago school", ' +
    '"mock vs stub vs fake", "test pyramid strategy", "testing trophy", "contract testing", "consumer ' +
    'driven contracts", "property based testing", "mutation testing", "code coverage gaming", ' +
    '"refactoring catalogue", "rename refactoring", "extract method", "inline temp", "replace ' +
    'conditional polymorphism", "code smell catalogue", "feature envy smell", "shotgun surgery ' +
    'smell", "primitive obsession", "data class smell", "long parameter list", "long method smell", ' +
    '"god class antipattern", "anemic domain model", "agile manifesto", "scrum framework", "kanban ' +
    'method", "xp extreme programming", "lean software development", "continuous integration ' +
    'practice", "continuous delivery practice", "trunk based development", "feature toggle", "blue ' +
    'green deployment", "canary deployment", "code review culture", "pair programming", "mob ' +
    'programming", "rubber duck debugging", "conway\'s law", "broken windows theory") — never the ' +
    'literal question phrasing or a bare pattern/principle name alone.',
  engineering:
    'If the input looks like Engineering SE questions (MECHANICAL / CIVIL / STRUCTURAL / CHEMICAL / ' +
    'AEROSPACE engineering — physical-world engineering NOT electronics — beams, materials, fluids, ' +
    'thermodynamics, manufacturing, structures, machines — "How do I calculate the load on …", ' +
    '"What is the right material for …", "Why does my [bridge/beam/joint/pipe] …", "How do I size ' +
    'a [pump/gear/bearing]", "What is the difference between [process A] and [process B]"), distill ' +
    'to the engineering concept (e.g. "beam bending stress", "moment of inertia section", ' +
    '"euler buckling column", "shear and moment diagram", "deflection cantilever beam", "truss ' +
    'analysis method of joints", "method of sections trusses", "indeterminate structure analysis", ' +
    '"finite element method intro", "stress strain curve", "yield strength steel", "ultimate ' +
    'tensile strength", "fatigue life cycles", "s-n curve fatigue", "fracture toughness", "stress ' +
    'concentration factor", "factor of safety design", "allowable stress design", "load and ' +
    'resistance factor design", "concrete reinforcement design", "rebar placement", "prestressed ' +
    'concrete", "steel connection design", "weld joint types", "bolt preload calculation", ' +
    '"thread engagement length", "gear tooth profile", "involute gear geometry", "gear train ratio", ' +
    '"helical gear design", "bevel gear configuration", "bearing selection ball roller", "shaft ' +
    'design fatigue", "keyway shaft connection", "spline shaft transmission", "hydraulic system ' +
    'design", "pneumatic actuator sizing", "pump curve operating point", "centrifugal pump head", ' +
    '"positive displacement pump", "pipe sizing pressure drop", "darcy weisbach friction", "moody ' +
    'diagram reynolds", "laminar versus turbulent flow", "boundary layer theory", "navier stokes ' +
    'intro", "compressible flow mach", "shock wave normal", "wing lift drag", "airfoil camber", ' +
    '"angle of attack stall", "control volume analysis", "first law thermodynamics", "second law ' +
    'thermodynamics", "carnot cycle efficiency", "rankine cycle steam", "brayton cycle gas turbine", ' +
    '"otto cycle engine", "diesel cycle engine", "refrigeration cycle vapor", "heat exchanger ' +
    'design", "lmtd log mean temperature", "ntu effectiveness method", "fin heat transfer", ' +
    '"conduction fourier law", "convection heat transfer coefficient", "radiation black body", ' +
    '"hvac load calculation", "manufacturing tolerance stack", "geometric dimensioning gd&t", ' +
    '"surface finish ra", "machining process selection", "cnc milling strategy", "turning lathe ' +
    'operations", "additive manufacturing fdm sla", "casting sand investment", "welding processes ' +
    'mig tig", "sheet metal bending k factor", "soil bearing capacity", "foundation design ' +
    'shallow", "pile foundation deep", "retaining wall earth pressure", "slope stability factor", ' +
    '"reinforced concrete column", "earthquake seismic design", "wind load building") — never the ' +
    'literal question phrasing or a bare formula/material name alone.',
  politics:
    'If the input looks like Politics SE questions (POLITICAL SCIENCE / political theory / ' +
    'electoral systems / comparative government / international relations / public policy — NOT ' +
    'current news headlines — "Why do [country/party] …", "What is the difference between ' +
    '[parliamentary / presidential]", "How does [electoral system X] work", "What were the ' +
    'consequences of [historical political event]", "How is [policy] designed in [country]"), ' +
    'distill to the political-science concept (e.g. "first past the post voting", "single ' +
    'transferable vote", "proportional representation", "mixed member proportional", "ranked ' +
    'choice voting", "approval voting method", "condorcet criterion", "arrow impossibility theorem", ' +
    '"gerrymandering districting", "malapportionment legislatures", "duverger\'s law", "median ' +
    'voter theorem", "spatial model politics", "rational choice theory", "principal agent ' +
    'politics", "veto player theory", "parliamentary system", "presidential system", "semi ' +
    'presidential system", "westminster model", "consociational democracy", "majoritarian system", ' +
    '"constitutional monarchy", "federal versus unitary state", "devolution power transfer", ' +
    '"separation of powers", "checks and balances", "judicial review supreme", "constitutional ' +
    'amendment process", "filibuster procedure", "cloture vote", "executive order limits", "war ' +
    'powers act", "impeachment procedure", "vote of no confidence", "coalition government ' +
    'formation", "minority government parliament", "grand coalition politics", "party whip ' +
    'discipline", "free vote conscience", "primary election system", "caucus versus primary", ' +
    '"campaign finance regulation", "citizens united ruling", "lobbying regulation", "revolving ' +
    'door politics", "interest groups pluralism", "iron triangle policy", "policy network theory", ' +
    '"political economy", "median voter electorate", "polarization measurement", "partisan sorting", ' +
    '"realignment theory", "critical election theory", "social cleavages politics", "cultural ' +
    'cleavage politics", "left right spectrum", "political compass dimensions", "horseshoe theory ' +
    'politics", "populism definition", "democratic backsliding", "competitive authoritarianism", ' +
    '"hybrid regime classification", "freedom house democracy index", "polity score regime", ' +
    '"democratic peace theory", "realism international relations", "liberalism international ' +
    'relations", "constructivism ir theory", "balance of power", "security dilemma", "nuclear ' +
    'deterrence theory", "alliance formation", "international institutions design", "soft power ' +
    'concept", "hegemonic stability theory", "world systems theory", "dependency theory ' +
    'development", "modernization theory", "post colonial state") — never the literal question ' +
    'phrasing or a bare politician/party name alone.',
  music:
    'If the input looks like Music: Practice & Theory SE questions (MUSIC THEORY / harmony / ' +
    'instruments / performance / composition / production — NOT music news or band gossip — ' +
    '"Why does this chord progression work", "How do I voice this …", "What scale fits over …", ' +
    '"Is it correct to write [interval / cadence] in [context]", "How do I practice [technique]", ' +
    '"What is the difference between [mode] and [mode]"), distill to the music concept (e.g. ' +
    '"circle of fifths", "chord progression analysis", "voice leading rules", "modal interchange", ' +
    '"secondary dominants", "tritone substitution", "modulation techniques", "diatonic harmony", ' +
    '"chromatic harmony", "extended chords ninth eleventh thirteenth", "chord inversions figured ' +
    'bass", "counterpoint species first second third fourth fifth", "fugue analysis", "sonata ' +
    'form exposition development recapitulation", "rondo form", "theme and variations", "twelve ' +
    'tone serialism", "atonal music", "minimalism music", "baroque ornamentation", "polyphony ' +
    'monody homophony", "ear training intervals", "perfect pitch versus relative pitch", "sight ' +
    'reading practice", "transposition by ear", "modal scales dorian phrygian lydian mixolydian ' +
    'aeolian locrian", "pentatonic scales major minor", "blues scale", "jazz harmony", "ii v i ' +
    'progression", "bebop scale", "chord scale theory", "comping patterns piano guitar", "walking ' +
    'bass line construction", "rootless voicings shell", "modal jazz", "fusion improvisation", ' +
    '"guitar fingerstyle technique", "alternate picking", "sweep picking", "tapping technique", ' +
    '"bending vibrato", "string gauges tone", "tube versus solid state amp", "pedalboard signal ' +
    'chain", "compressor pedal", "overdrive distortion fuzz", "delay reverb pedals", "piano ' +
    'pedaling sostenuto una corda", "scale fingerings piano", "hanon exercises", "czerny etudes", ' +
    '"bach inventions", "violin bowing détaché spiccato", "drumming rudiments paradiddle", ' +
    '"polyrhythm cross rhythm", "odd time signatures seven eight five eight", "swing feel triplet", ' +
    '"shuffle feel", "metronome practice", "deliberate practice music", "performance anxiety", ' +
    '"audition preparation", "music notation engraving", "lilypond musescore sibelius finale", "DAW ' +
    'production logic ableton pro tools", "MIDI velocity quantization", "audio interface latency ' +
    'buffer", "monitor headphones flat response", "near field monitors", "room acoustics treatment", ' +
    '"mixing reference tracks", "mastering loudness lufs", "dynamic range compression", "EQ ' +
    'subtractive additive", "reverb send return bus", "automation mixing fader", "stereo imaging ' +
    'panning") — never the literal question phrasing or a bare song/artist name alone.',
  photo:
    'If the input looks like Photography SE questions (CAMERAS / lenses / lighting / composition / ' +
    'editing / printing — NOT camera-purchase news — "Why does my photo look [problem]", "How do I ' +
    'shoot [scene] in [conditions]", "What focal length / aperture for [subject]", "How do I light ' +
    '[portrait / product]", "What does [exif setting] do"), distill to the photography concept (e.g. ' +
    '"exposure triangle", "aperture depth of field", "shutter speed motion blur", "iso noise ' +
    'tradeoff", "f stop reciprocity", "hyperfocal distance", "focal length compression", "crop ' +
    'factor full frame", "lens distortion barrel pincushion", "chromatic aberration purple fringing", ' +
    '"vignetting falloff", "diffraction limited aperture", "bokeh quality circle of confusion", ' +
    '"specular highlights blowout", "rule of thirds", "leading lines composition", "negative space ' +
    'composition", "fill flash technique", "rembrandt lighting portrait", "butterfly lighting ' +
    'beauty", "split lighting dramatic", "broad versus short lighting", "softbox versus umbrella", ' +
    '"key fill rim three point lighting", "high key low key", "white balance kelvin", "color ' +
    'temperature mixed lighting", "raw versus jpeg shooting", "histogram exposure reading", "expose ' +
    'to the right ettr", "dynamic range scene", "hdr bracketing tonemapping", "focus stacking ' +
    'macro", "panorama stitching", "long exposure tripod", "intervalometer timelapse", ' +
    '"astrophotography star tracking", "milky way settings", "star trails composition", "light ' +
    'painting technique", "macro reproduction ratio one to one", "extension tubes close up", "tilt ' +
    'shift architecture", "perspective correction keystone", "wide angle distortion", "telephoto ' +
    'subject isolation", "portrait posing", "headshot lighting", "environmental portrait", "candid ' +
    'street photography", "documentary photography ethics", "decisive moment cartier bresson", ' +
    '"zone system ansel adams", "darkroom development", "film stock characteristics", "push pull ' +
    'processing", "scanner negative film", "lightroom catalog organization", "photoshop layers ' +
    'masks", "luminosity masks", "frequency separation skin", "dodge burn retouching", "color ' +
    'grading split toning", "lightroom presets", "tethering studio capture", "color management ' +
    'calibration", "monitor calibration spyder", "soft proofing print", "icc profile printer", ' +
    '"archival paper inkjet", "matte versus glossy paper", "framing matting print", "copyright ' +
    'photography", "model release shoot", "weather sealed body", "image stabilization in body ' +
    'lens", "autofocus tracking subject", "back button focus", "manual focus peaking", "rangefinder ' +
    'versus slr", "mirrorless adoption", "medium format digital") — never the literal question ' +
    'phrasing or a bare camera/lens model alone.',
  ham:
    'If the input looks like Amateur Radio SE questions (HAM RADIO operating / propagation / ' +
    'antennas / FCC rules / digital modes / morse — distinct from electronics SE which is ' +
    'circuits/embedded EE — "What antenna for [band] in [space]", "Why doesn\'t my [HF/VHF] reach ' +
    '[distance]", "What does [Q-code / RST report] mean", "How do I get [license class]", "What ' +
    'is the difference between [SSB/AM/FM/CW] for …"), distill to the amateur-radio concept (e.g. ' +
    '"license class technician general extra", "fcc part 97 rules", "callsign assignment policy", ' +
    '"vanity callsign", "dxcc entities list", "qsl card exchange", "logbook of the world lotw", ' +
    '"field day operating", "parks on the air pota", "summits on the air sota", "contest operating ' +
    'cq", "dx cluster spotting", "split frequency operation", "dx pileup technique", "propagation ' +
    'hf skip", "f layer ionosphere", "e skip sporadic", "grayline propagation", "tropospheric ' +
    'ducting vhf", "meteor scatter", "eme moonbounce", "solar flux index sfi", "k index a index ' +
    'geomagnetic", "muf maximum usable frequency", "luf lowest usable frequency", "groundwave ' +
    'skywave", "antenna swr matching", "balun choke common mode", "dipole antenna theory", "yagi ' +
    'antenna gain front to back", "log periodic broadband", "vertical antenna radials counterpoise", ' +
    '"loop antenna magnetic", "moxon antenna", "j pole antenna vhf", "discone wideband", "rhombic ' +
    'antenna directional", "feedline loss coax ladder line", "open wire feedline", "antenna tuner ' +
    'manual auto", "transmatch mismatched load", "smith chart impedance", "transceiver ' +
    'superheterodyne sdr", "qrp low power operation", "qro high power", "ft8 weak signal mode", ' +
    '"jt65 jt9 digital", "psk31 keyboard mode", "cw morse code keying", "qso contact protocol", ' +
    '"q codes shorthand", "phonetic alphabet nato", "rst signal report", "repeater offset ctcss ' +
    'tone", "dtmf tones autopatch", "echolink internet linking", "dmr digital mobile radio", "d ' +
    'star digital voice", "c4fm system fusion", "aprs automatic packet reporting", "winlink email ' +
    'hf", "ssb upper lower sideband", "am cw fm modes", "frequency band plan hf vhf uhf", ' +
    '"satellite operation fm linear transponder", "iss amateur radio", "balloon high altitude ' +
    'aprs", "lightning protection grounding", "common mode current rfi", "emi filtering", "shielded ' +
    'cable enclosure", "tower climbing safety", "guying rotator antenna", "elmer mentor tradition", ' +
    '"arrl membership", "iaru region band plan") — never the literal question phrasing or a bare ' +
    'callsign/frequency alone.',
  buddhism:
    'If the input looks like Buddhism SE questions (CONTEMPLATIVE PRACTICE / dharma / meditation / ' +
    'monastic ethics / lineages — not religious news or sectarian polemic — "What does [sutra/text] ' +
    'mean by …", "How does [school/lineage] interpret …", "Is [practice] consistent with …", "What ' +
    'is the difference between [theravada/mahayana/vajrayana] on [topic]"), distill to the buddhist ' +
    'concept (e.g. "four noble truths", "noble eightfold path", "right view samma ditthi", "right ' +
    'intention samma sankappa", "right speech samma vaca", "right action samma kammanta", "right ' +
    'livelihood samma ajiva", "right effort samma vayama", "right mindfulness samma sati", "right ' +
    'concentration samma samadhi", "three marks of existence", "anicca impermanence", "dukkha ' +
    'unsatisfactoriness", "anatta non self", "dependent origination paticca samuppada", "twelve ' +
    'nidanas", "five aggregates skandhas", "rupa form aggregate", "vedana feeling aggregate", "sanna ' +
    'perception aggregate", "sankhara mental formations", "vinnana consciousness aggregate", "five ' +
    'precepts panca sila", "ten precepts dasa sila", "vinaya monastic discipline", "patimokkha rule", ' +
    '"sangha community", "bhikkhu monk ordination", "bhikkhuni nun ordination", "lay practitioner ' +
    'upasaka", "refuge in three jewels", "buddha dharma sangha refuge", "samatha calm abiding", ' +
    '"vipassana insight meditation", "anapanasati breath mindfulness", "metta loving kindness", ' +
    '"karuna compassion", "mudita sympathetic joy", "upekkha equanimity", "brahmaviharas four", ' +
    '"jhana meditative absorption", "first jhana through fourth", "formless jhanas arupa", ' +
    '"satipatthana four foundations", "kayanupassana body contemplation", "vedananupassana feeling ' +
    'contemplation", "cittanupassana mind contemplation", "dhammanupassana phenomena contemplation", ' +
    '"hindrances five nivarana", "factors of awakening seven bojjhanga", "wholesome roots kusala ' +
    'mula", "unwholesome roots akusala mula", "greed dosa moha hatred delusion", "karma intention ' +
    'cetana", "rebirth punabbhava", "samsara cyclic existence", "nirvana nibbana extinction", ' +
    '"parinirvana final passing", "buddha nature tathagatagarbha", "emptiness sunyata", "two truths ' +
    'doctrine", "madhyamaka middle way", "nagarjuna mulamadhyamakakarika", "yogacara consciousness ' +
    'only", "asanga vasubandhu", "abhidharma analysis", "abhidhamma pitaka", "sutta pitaka", ' +
    '"vinaya pitaka", "tripitaka three baskets", "pali canon", "mahayana sutras", "lotus sutra", ' +
    '"heart sutra", "diamond sutra", "vimalakirti sutra", "avatamsaka flower garland", "lankavatara ' +
    'sutra", "pure land amitabha", "zen chan dhyana", "rinzai soto lineages", "koan practice", ' +
    '"shikantaza just sitting", "mindfulness movement secular", "engaged buddhism", "tibetan ' +
    'vajrayana tantra", "guru lama relationship", "ngondro preliminary practices", "lojong mind ' +
    'training", "tonglen sending receiving", "bardo intermediate state", "dzogchen great ' +
    'perfection", "mahamudra great seal") — never the literal question phrasing or a bare ' +
    'lineage/teacher name alone.',
  tex:
    'If the input looks like TeX/LaTeX SE questions (DOCUMENT TYPESETTING / mathematical macros / ' +
    'package use / typography / BibTeX / TikZ — "How do I align …", "Why does my [equation/figure/' +
    'table] not …", "What is the difference between [\\command] and [\\command]", "How do I create ' +
    'a [environment] for …"), distill to the tex/latex concept (e.g. "amsmath align environment", ' +
    '"equation numbering control", "tag command label", "ref hyperref autoref cleveref", "split ' +
    'multiline equation", "cases environment piecewise", "matrix bmatrix pmatrix vmatrix", "array ' +
    'column alignment", "tabular column types", "tabularx booktabs rules", "longtable multipage", ' +
    '"siunitx units numbers", "biblatex biber bibliography", "natbib citation styles", "csquotes ' +
    'quotation", "babel polyglossia language", "fontspec lualatex xelatex", "microtype protrusion ' +
    'expansion", "geometry page layout", "fancyhdr headers footers", "titlesec section formatting", ' +
    '"hyperref pdf bookmarks", "tocloft table of contents", "etoolbox patchcmd", "expl3 latex3 ' +
    'kernel", "xparse argument parsing", "newcommand newenvironment", "renewcommand override", ' +
    '"fragile robust commands", "verbatim listings minted", "xcolor color models", "graphicx ' +
    'includegraphics", "tikz pgf graphics", "tikz nodes edges", "tikz arrows decorations", "pgfplots ' +
    'data plotting", "circuitikz electrical schematics", "chemfig chemistry diagrams", "musixtex ' +
    'music notation", "beamer presentation overlays", "moderncv resume class", "memoir koma script ' +
    'classes", "article report book classes", "standalone document class", "subfiles main subfile", ' +
    '"input include subfiles", "footnote footnotemark footnotetext", "marginnote marginpar", ' +
    '"glossaries acronym package", "todonotes margin annotations", "cleveref autorefname", "label ' +
    'naming conventions", "preamble organization", "scratch document compile", "pdflatex compile ' +
    'pipeline", "lualatex extensions", "xelatex unicode opentype", "context typesetting alternative", ' +
    '"plain tex roots", "knuth tex original", "cm fonts computer modern", "latin modern fonts", ' +
    '"font selection nfss", "encoding t1 ot1", "math fonts mtpro mathptmx", "lualatex luafont", ' +
    '"opentype mathematical fonts", "amssymb symbols", "stmaryrd symbols", "esint integral ' +
    'symbols", "physics package notation", "diffcoeff derivatives", "tcolorbox styled boxes", ' +
    '"mdframed framed environments", "thmtools theorem environments", "amsthm theorem proof", ' +
    '"enumitem list customization", "regression testing latex", "latexindent formatting", ' +
    '"chktex linting") — never the literal question phrasing or a bare command name alone.',
  expatriates:
    'If the input looks like Expatriates SE questions (LIVING / WORKING / MOVING ABROAD — visa / ' +
    'residency / cross-border tax / banking / healthcare / schooling / cultural integration — NOT ' +
    'pure travel-tourism — "How do I get a [visa type] for [country]", "What are the tax ' +
    'implications of [residency status]", "Can I [activity] on [visa class]", "How does [country] ' +
    'treat [worldwide income / dual citizenship / foreign earned income]"), distill to the expat ' +
    'concept (e.g. "tourist visa schengen", "schengen 90 180 rule", "etias european travel ' +
    'authorization", "residence permit eu national", "blue card eu skilled worker", "long term ' +
    'resident eu", "permanent residence settled status", "naturalization citizenship application", ' +
    '"jus soli jus sanguinis", "dual citizenship country list", "renouncing citizenship", "us ' +
    'expatriation tax", "fbar fincen 114", "fatca foreign account reporting", "form 8938 specified ' +
    'foreign financial assets", "foreign earned income exclusion feie", "foreign tax credit ftc", ' +
    'tax treaty tie breaker rules", "non resident alien us tax", "domicile versus residence", ' +
    '"183 day rule tax residency", "centre of vital interests test", "totalization agreements ' +
    'social security", "us social security totalization", "uk hmrc statutory residence test", ' +
    '"non dom uk tax", "remittance basis taxation", "uk visa skilled worker", "h1b us specialty ' +
    'occupation", "h4 dependent visa", "j1 exchange visitor", "two year home residency requirement ' +
    '212e", "f1 student visa cpt opt", "stem opt extension", "l1 intracompany transferee", "o1 ' +
    'extraordinary ability", "eb green card categories", "perm labor certification", "i 140 ' +
    'immigrant petition", "adjustment of status i 485", "consular processing", "ds 160 nonimmigrant ' +
    'application", "ds 260 immigrant application", "advance parole travel document", "marriage ' +
    'green card k1 k3", "investor visa eb 5", "e2 treaty investor", "e1 treaty trader", "e3 ' +
    'australian specialty", "tn nafta usmca professional", "canada express entry", "crs ' +
    'comprehensive ranking system", "australia skilled migration", "189 190 491 visa", "subclass ' +
    'visa australia", "new zealand skilled migrant", "japan highly skilled professional points", ' +
    '"singapore employment pass", "uae golden visa", "portugal d7 passive income", "spain non ' +
    'lucrative visa", "italy elective residence", "france talent passport", "germany freelance ' +
    'freiberufler visa", "netherlands dafvt", "ireland critical skills permit", "thailand ltr long ' +
    'term resident", "thailand smart visa", "digital nomad visa countries", "international health ' +
    'insurance expat", "schengen travel insurance requirement", "domiciliation bank account abroad", ' +
    '"opening foreign bank account", "currency conversion remittance", "wise transferwise transfer ' +
    'fees", "international school curriculum", "ib british american curriculum schools", "moving ' +
    'pets internationally", "pet quarantine rules", "shipping household goods abroad", "exit tax ' +
    'departure", "deemed disposition canada departure tax") — never the literal question phrasing ' +
    'or a bare country/visa-name alone.',
  puzzling:
    'If the input looks like Puzzling SE questions (RECREATIONAL LOGIC PUZZLES — riddles / lateral ' +
    'thinking / cipher / cryptic crosswords / mathematical puzzles / chess problems framed as ' +
    'puzzles / situation puzzles / "What am I?" — NOT real-world problem solving — "I have N ' +
    'objects and …", "Decipher this message", "What is the next term in this sequence", "Find the ' +
    'minimum number of …"), distill to the puzzle concept (e.g. "knights and knaves logic", ' +
    '"liar truth teller puzzles", "wolf goat cabbage river crossing", "missionaries cannibals ' +
    'crossing", "fox chicken grain crossing", "bridge and torch puzzle", "100 prisoners hat ' +
    'puzzle", "pirates gold puzzle", "blue eyed islanders", "two envelope paradox", "monty hall ' +
    'problem", "bertrand box paradox", "boy or girl paradox", "secretary problem optimal stopping", ' +
    '"st petersburg paradox", "prisoners dilemma puzzle", "tower of hanoi", "8 queens problem", ' +
    '"knights tour", "magic square puzzle", "sudoku solving techniques", "kakuro logic puzzle", ' +
    '"nonogram picross", "hashiwokakero bridges", "slitherlink puzzle", "masyu puzzle", "kenken ' +
    'puzzle", "kakurasu puzzle", "killer sudoku", "futoshiki puzzle", "yajilin puzzle", "skyscrapers ' +
    'puzzle", "battleship logic puzzle", "lights out puzzle", "fifteen puzzle", "rubiks cube ' +
    'algorithms", "rush hour puzzle", "sokoban puzzle", "minesweeper logic", "cryptic crossword ' +
    'clues", "anagram indicator", "double definition cryptic", "hidden word indicator", "container ' +
    'cryptic", "reversal indicator", "homophone clue", "spoonerism clue", "lipogram", "pangram ' +
    'puzzle", "isogram puzzle", "letter frequency analysis", "caesar cipher", "vigenere cipher", ' +
    '"playfair cipher", "atbash cipher", "rot13 transformation", "morse code puzzle", "semaphore ' +
    'flag code", "navajo code talker", "polybius square", "rail fence cipher", "transposition ' +
    'cipher", "substitution cipher cryptanalysis", "alphametics cryptarithm", "send more money ' +
    'puzzle", "missing dollar riddle", "weighing puzzle balance scale", "12 coins counterfeit", ' +
    '"fake coin balance puzzle", "petri dish bacteria doubling", "einsteins riddle zebra puzzle", ' +
    '"lateral thinking puzzles", "situation puzzle yes no", "what am i riddle", "who am i riddle", ' +
    '"rebus puzzle", "ditloid puzzle", "pictionary puzzle", "escape room logic", "cryptex ' +
    'combination puzzle", "knight problem chess", "bishop tour puzzle", "rook polynomial", "tour ' +
    'puzzle graph theory", "hamiltonian path puzzle", "eulerian path puzzle", "graph coloring ' +
    'puzzle", "four color theorem puzzle", "magic constant", "latin square puzzle", "graeco latin ' +
    'square") — never the literal question phrasing or a bare puzzle-title alone.',
  bricks:
    'If the input looks like Bricks (LEGO) SE questions (LEGO building / sets / parts / minifigures ' +
    '/ techniques / Bionicle / Technic / Mindstorms / collecting — NOT generic toy news — "How ' +
    'do I attach …", "What part is …", "Which set contains …", "Is this part rare", "How do I ' +
    'reinforce …"), distill to the lego/brick concept (e.g. "stud connection lego", "anti stud ' +
    'attachment", "snot studs not on top", "bracket piece reverse stud", "headlight brick erling", ' +
    '"jumper plate offset", "cheese slope wedge", "modified plate clip", "modified plate bar", ' +
    '"technic pin connector", "technic axle types", "technic liftarm beam", "technic gear ratios", ' +
    '"technic differential gearing", "technic universal joint", "technic suspension geometry", ' +
    '"technic rack and pinion steering", "technic linear actuator", "power functions motors", ' +
    '"powered up hub", "control plus app", "spike prime education", "mindstorms ev3 nxt", ' +
    '"bionicle gear function", "hero factory parts", "minifigure articulation joints", ' +
    '"minifigure printing methods", "minifigure accessories", "lego dimensions tag", ' +
    '"part numbering bricklink", "design id versus element id", "rebrickable parts inventory", ' +
    '"bricklink part identification", "color naming lego", "transparent colored bricks", ' +
    '"discontinued lego color", "milky transparency yellowing abs", "abs plastic deterioration", ' +
    '"vintage lego cleaning", "brick separator tool", "stud reinforcement technique", "moc my own ' +
    'creation", "lego architecture style", "lego modular building standards", "studs not on top ' +
    'building", "studs not on bottom building", "midi scale moc", "microscale moc", "miniland ' +
    'figure scale", "minifig scale buildings", "lego ideas submission", "lego cuusoo legacy", ' +
    '"afol adult fan of lego", "tfol teen fan of lego", "kfol kid fan of lego", "lug lego user ' +
    'group", "lego classic versus themed", "speed champions scale", "speed champions windscreens", ' +
    '"creator expert sets", "modular buildings series", "winter village series", "expert ' +
    'designer set", "bionicle masks of power", "ninjago dragon builds", "lego friends olive skin ' +
    'parts", "lego star wars ucs sets", "lego harry potter great hall", "lego batman modular", ' +
    '"lego ideas iss", "scaling lego trains", "lego train track gauge", "lego monorail system", ' +
    '"lego trains 9v 12v", "powered up train hub", "duplo to lego scale", "duplo train ' +
    'compatibility", "lego boost programming", "lego education we do", "first lego league") — ' +
    'never the literal question phrasing or a bare set-name alone.',
  ai:
    'If the input looks like Artificial Intelligence SE questions (AI THEORY / ML ALGORITHMS / NEURAL ' +
    'NETS / SEARCH / RL / NLP / COMPUTER VISION / ETHICS — academic/conceptual, NOT software-vendor ' +
    'comparisons or hype-news — "Why does [algorithm] do …", "What is the difference between [A] ' +
    'and [B]", "How does [architecture] handle …", "Is [property] guaranteed for [model class]"), ' +
    'distill to the AI/ML concept (e.g. "transformer architecture", "attention mechanism", ' +
    '"self attention multi head", "scaled dot product attention", "positional encoding rotary", ' +
    '"layer normalization rmsnorm", "residual connections", "encoder decoder transformer", "decoder ' +
    'only architecture", "mixture of experts moe", "sparse activation", "speculative decoding", ' +
    '"flash attention", "kv cache optimization", "quantization int8 int4", "gptq awq quantization", ' +
    '"lora low rank adaptation", "qlora fine tuning", "rlhf human feedback", "dpo direct preference ' +
    'optimization", "constitutional ai", "chain of thought prompting", "few shot in context ' +
    'learning", "instruction tuning", "alpaca self instruct", "scaling laws chinchilla", "emergent ' +
    'abilities", "grokking phenomenon", "double descent", "neural tangent kernel", "lottery ticket ' +
    'hypothesis", "pruning structured unstructured", "knowledge distillation", "teacher student ' +
    'distillation", "diffusion models ddpm", "ddim sampling", "score based generative models", ' +
    '"latent diffusion", "stable diffusion architecture", "vae variational autoencoder", "gan ' +
    'training collapse", "wasserstein gan", "energy based models", "normalizing flows", ' +
    '"autoregressive models", "masked language modeling", "next token prediction", "perplexity ' +
    'metric", "bleu rouge metrics", "f1 precision recall", "roc auc binary classification", ' +
    '"calibration brier score", "out of distribution detection", "uncertainty quantification", ' +
    '"bayesian neural networks", "monte carlo dropout", "ensemble methods bagging boosting", ' +
    '"gradient boosting xgboost", "random forest decision tree", "support vector machine kernel", ' +
    '"kmeans clustering", "dbscan density clustering", "hierarchical clustering", "pca dimensionality ' +
    'reduction", "tsne umap visualization", "manifold learning isomap", "autoencoder ' +
    'representation", "contrastive learning simclr", "byol self supervised", "masked autoencoder ' +
    'mae", "clip vision language", "vit vision transformer", "yolo object detection", "rcnn ' +
    'faster rcnn", "u net segmentation", "deeplab segmentation", "instance segmentation mask rcnn", ' +
    '"pose estimation hrnet", "graph neural networks gnn", "graph convolution gcn", "graph ' +
    'attention gat", "message passing nn", "knowledge graph embedding", "transe rotate node2vec", ' +
    '"reinforcement learning q learning", "deep q network dqn", "policy gradient reinforce", ' +
    '"actor critic a2c a3c", "ppo proximal policy", "ddpg sac td3", "model based rl mcts", "alpha ' +
    'go alpha zero", "muzero learned model", "exploration exploitation tradeoff", "thompson ' +
    'sampling", "contextual bandits", "imitation learning behavioral cloning", "inverse rl irl", ' +
    '"meta learning maml", "few shot prototypical", "lifelong learning continual", "catastrophic ' +
    'forgetting", "transfer learning domain adaptation", "ai alignment problem", "reward hacking", ' +
    '"goal misgeneralization", "interpretability mechanistic", "feature visualization", "lime ' +
    'shap explainability") — never the literal question phrasing or a bare model-name alone.',
  astronomy:
    'If the input looks like Astronomy SE questions (STARGAZING / OBSERVATIONAL ASTRONOMY / ' +
    'STELLAR PHYSICS / COSMOLOGY / SOLAR SYSTEM / SPACECRAFT MISSIONS — research-grade or amateur, ' +
    'NOT astrology / NOT space-tourism news — "Why does [phenomenon] occur in [object]", "How was ' +
    '[discovery] made", "What would happen if [scenario]", "Can [object] form via [mechanism]"), ' +
    'distill to the astronomy concept (e.g. "stellar nucleosynthesis", "main sequence evolution", ' +
    '"hertzsprung russell diagram", "stellar classification spectral", "luminosity temperature ' +
    'relation", "mass luminosity relation", "stellar parallax distance", "cepheid variable ' +
    'standard candle", "type ia supernova distance", "redshift distance hubble", "cosmological ' +
    'redshift", "doppler shift radial velocity", "transit photometry exoplanet", "radial velocity ' +
    'detection method", "direct imaging exoplanet", "microlensing detection", "transit timing ' +
    'variation", "habitable zone goldilocks", "tidal locking phase", "kepler third law", "orbital ' +
    'mechanics two body", "lagrange points l1 l5", "hill sphere gravity", "roche limit tidal ' +
    'disruption", "perihelion precession", "milankovitch cycles", "ecliptic plane obliquity", ' +
    '"precession of equinoxes", "synodic sidereal period", "apparent magnitude absolute", "color ' +
    'index b v", "extinction reddening interstellar", "interstellar medium ism", "molecular cloud ' +
    'collapse", "jeans instability mass", "protostar formation", "t tauri pre main sequence", ' +
    '"protoplanetary disk", "planet formation core accretion", "pebble accretion mechanism", ' +
    '"giant impact moon formation", "late heavy bombardment", "asteroid belt resonance", "kirkwood ' +
    'gaps", "kuiper belt objects", "oort cloud comets", "dwarf planet definition", "trojan ' +
    'asteroids l4 l5", "near earth object neo", "yarkovsky yorp effect", "comet nucleus coma ' +
    'tail", "ion tail dust tail", "meteor shower radiant", "zodiacal light dust", "aurora ' +
    'borealis solar wind", "magnetosphere interaction", "coronal mass ejection cme", "solar ' +
    'flare classification", "sunspot cycle 11 year", "differential rotation sun", "helioseismology ' +
    'pressure modes", "solar neutrino problem", "neutrino oscillation pmns", "mhd magnetohydrodynamics ' +
    'sun", "stellar evolution agb", "planetary nebula formation", "white dwarf chandrasekhar", "ia ' +
    'progenitor double degenerate", "core collapse supernova", "neutron star pulsar", "millisecond ' +
    'pulsar recycled", "magnetar magnetic field", "frb fast radio burst", "gamma ray burst long ' +
    'short", "kilonova neutron star merger", "gravitational wave ligo virgo", "binary black hole ' +
    'merger", "eccentricity gw signal", "supermassive black hole", "active galactic nuclei agn", ' +
    '"quasar accretion disk", "blazar jet beamed", "tidal disruption event", "galaxy classification ' +
    'hubble", "spiral elliptical s0", "dark matter halo nfw", "rotation curve flat", "bullet ' +
    'cluster lensing", "weak lensing cosmic shear", "strong lensing einstein ring", "baryon ' +
    'acoustic oscillation bao", "cmb cosmic microwave background", "planck wmap satellite", ' +
    '"acoustic peaks cmb", "lambda cdm cosmology", "inflation slow roll", "primordial gravitational ' +
    'waves", "big bang nucleosynthesis bbn", "recombination decoupling", "reionization first ' +
    'stars", "population iii stars", "james webb space telescope jwst", "hubble space telescope ' +
    'hst", "tess transit survey", "gaia astrometry", "vlt elt extremely large", "alma ' +
    'submillimeter array", "event horizon telescope vlbi") — never the literal question phrasing ' +
    'or a bare object-name alone.',
  judaism:
    'If the input looks like Mi Yodeya (Judaism) SE questions (RABBINIC LAW / HALAKHA / TANAKH / TALMUD / ' +
    'HEBREW LITURGY / JEWISH HOLIDAYS / KASHRUT / SHABBAT / FAMILY PURITY — sourced and rabbinically ' +
    'framed, NOT christian theology and NOT secular Jewish-history news — "Why does halakha …", ' +
    '"What is the source for …", "How is [law] derived from …", "When may one …"), distill to the ' +
    'jewish-law/text concept (e.g. "halakha decision making process", "psak halakha rabbinic ruling", ' +
    '"talmud bavli yerushalmi", "gemara discussion structure", "mishna structure six orders", ' +
    '"tosafot rishonim acharonim", "rashi commentary tanakh", "rambam mishneh torah", "shulchan ' +
    'aruch four parts", "orach chaim yoreh deah even haezer choshen mishpat", "kashrut laws meat ' +
    'milk", "kosher slaughter shechita", "bedikat chametz pesach", "matzah baking 18 minutes", ' +
    '"seder plate symbols", "four cups passover", "afikoman tradition", "counting omer 49 days", ' +
    '"shavuot revelation torah", "tisha bav fast destruction", "rosh hashanah shofar blasts", ' +
    '"yom kippur five afflictions", "sukkot four species lulav etrog", "schach roof requirements", ' +
    '"hanukkah menorah lighting order", "pirsumei nisa publicizing miracle", "purim megillah ' +
    'reading", "mishloach manot matanot laevyonim", "shabbat 39 melachot prohibited", "muktzeh ' +
    'shabbat handling", "eruv chatzeirot carrying", "kiddush wine bread", "havdalah ceremony", ' +
    '"birkat hamazon grace after meals", "shema prayer recitation", "amidah eighteen blessings", ' +
    '"tefillin head arm placement", "tzitzit fringe garment", "mezuzah doorpost klaf", "tevilah ' +
    'mikveh immersion", "niddah taharat hamishpacha", "chuppah kiddushin marriage", "ketubah ' +
    'document obligations", "get divorce halakha", "yibum chalitzah levirate", "circumcision brit ' +
    'milah eighth day", "pidyon haben firstborn redemption", "bar mitzvah age thirteen", "tanakh ' +
    'masorah accents", "trope cantillation marks", "names of god prohibition", "tetragrammaton ' +
    'yhwh", "kabbalah sefirot tree", "zohar mystical text", "chassidut hassidic philosophy", ' +
    '"litvish lithuanian yeshiva", "modern orthodox approach", "religious zionism mizrachi", ' +
    '"haredi ultra orthodox", "conversion giyur process", "noahide laws seven", "tikkun olam ' +
    'concept", "pikuach nefesh saving life") — never the literal question phrasing or a bare ' +
    'parsha-name alone.',
  pets:
    'If the input looks like Pets SE questions (DOMESTIC ANIMAL CARE — dogs / cats / rodents / birds / ' +
    'fish / reptiles / behavior / nutrition / training / health — household-companion focus, NOT ' +
    'wildlife biology and NOT veterinary research — "Why does my [pet] …", "How do I train …", ' +
    '"What should I feed …", "Is it safe to …"), distill to the pet-care concept (e.g. "puppy ' +
    'socialization window", "operant conditioning clicker training", "positive reinforcement ' +
    'training", "leash reactivity desensitization", "separation anxiety dog", "crate training ' +
    'progression", "house training schedule", "litter box training cat", "feline urinary marking", ' +
    'spraying neutering effect", "scratching post placement", "high places vertical territory cat", ' +
    '"play aggression kitten", "redirected aggression cat", "cat introduction protocol", "dog ' +
    'introduction neutral territory", "resource guarding food bowl", "muzzle conditioning dog", ' +
    '"dog body language calming signals", "tail wagging direction meaning", "ear positions cat ' +
    'mood", "purring stress vs contentment", "kneading instinct cat", "binkies rabbit behavior", ' +
    '"foot stomping rabbit warning", "guinea pig wheek vocalization", "hedgehog quilling normal", ' +
    '"hamster topical bath sand", "ferret war dance", "parrot biting hierarchy", "feather plucking ' +
    'parrot", "stereotyped behavior pacing", "cage size minimum standards", "enrichment foraging ' +
    'toys", "raw diet barf prey model", "kibble vs wet food", "grain free dcm cardiomyopathy", ' +
    '"taurine deficiency cat", "thiamine cooked fish raw", "chocolate theobromine toxicity", ' +
    '"xylitol dog poisoning", "lily cat kidney failure", "grape raisin nephrotoxicity", "onion ' +
    'garlic hemolytic anemia", "macadamia nut dog", "raw bones safety", "antlers chew toy fracture", ' +
    '"flea life cycle treatment", "tick prevention spot on", "heartworm prevention monthly", ' +
    '"dewormer pyrantel praziquantel", "vaccination schedule core noncore", "rabies legal ' +
    'requirement", "dhpp distemper parvo", "fvrcp cat vaccine", "spay neuter age controversy", ' +
    '"luxating patella small breed", "hip dysplasia large breed", "brachycephalic syndrome bulldog", ' +
    '"hyperthyroidism older cat", "diabetes cat insulin glargine", "kidney disease ckd cat", ' +
    '"dental scaling anesthesia", "anal gland expression dog", "bsava pet first aid", "betta fish ' +
    'cycling tank", "nitrogen cycle aquarium", "cycled tank ammonia nitrite nitrate", "fish in vs ' +
    'fishless cycling", "freshwater stocking density", "saltwater reef tank parameters", "marine ' +
    'fish quarantine", "uvb lighting reptile", "calcium d3 dusting", "humidity gradient terrarium", ' +
    '"thermal gradient basking", "pet bonding attachment", "rainbow bridge euthanasia decision") — ' +
    'never the literal question phrasing or a bare breed-name alone.',
  outdoors:
    'If the input looks like The Great Outdoors SE questions (HIKING / BACKPACKING / CAMPING / ' +
    'CLIMBING / KAYAKING / NAVIGATION / WILDERNESS SURVIVAL — outdoor recreation skills, NOT travel ' +
    'tourism and NOT vehicle off-roading — "How do I [skill] in the backcountry", "What is the ' +
    'best way to [survive/navigate]", "Why do I get [problem] when …", "When should I bring …"), ' +
    'distill to the outdoor concept (e.g. "ultralight backpacking philosophy", "base weight ' +
    'reduction", "big three pack tent sleep", "trail runner vs hiking boot", "vibram sole grip", ' +
    'gore tex breathability membrane", "layering system base mid shell", "merino wool moisture ' +
    'management", "synthetic insulation wet", "down fill power loft", "hypothermia stages ' +
    'recognition", "frostbite prevention extremities", "heat exhaustion vs heatstroke", "altitude ' +
    'sickness ams hace hape", "diamox acetazolamide prophylaxis", "rule of threes survival", "ten ' +
    'essentials pack", "leave no trace seven principles", "switchback erosion trail", "blaze ' +
    'marker cairn navigation", "topographic map contour interval", "compass declination adjustment", ' +
    '"bearing triangulation orientation", "gps utm latitude longitude", "garmin inreach satellite ' +
    'communicator", "personal locator beacon plb", "spot satellite messenger", "water purification ' +
    'methods", "filter vs purifier microfilter", "sawyer squeeze hollow fiber", "platypus gravity ' +
    'system", "boiling sterilization minutes", "iodine chlorine dioxide tablets", "uv sterilization ' +
    'steripen", "giardia cryptosporidium contamination", "bear canister regulation", "bear hang ' +
    'pct method", "bear bag ursack", "scent management food storage", "freeze dried backpacking ' +
    'meal", "alcohol stove vs canister", "msr whisperlite liquid fuel", "jetboil integrated stove", ' +
    'esbit solid fuel tablet", "wood gasifier stove", "fire steel ferro rod", "tinder bundle ' +
    'preparation", "bow drill friction fire", "tarp shelter configurations", "a frame tarp ' +
    'pitch", "tent vs hammock ul", "underquilt hammock insulation", "bivy sack emergency", "down ' +
    'sleeping bag temp rating", "iso en standard rating", "sleeping pad r value", "closed cell ' +
    'foam vs inflatable", "trekking pole technique downhill", "ice axe self arrest", "crampon ' +
    'point types", "glacier travel rope team", "crevasse rescue z pulley", "anchor placement ' +
    'climbing", "trad protection cams nuts", "sport climbing route grades", "yds class system", ' +
    '"belay device tube atc", "rappel descender autoblock", "rope management coiling", "knot tying ' +
    'figure eight", "double fisherman bend", "munter hitch belay", "prusik friction hitch", "mule ' +
    'overhand release", "kayak roll eskimo", "edging carving turn", "wet exit bracing", "river ' +
    'reading hydraulics", "ferry angle current", "eddy line peel out", "swiftwater rescue throw ' +
    'bag", "pfd type rating", "drysuit immersion cold", "trail runner ultralight ultraultra") — ' +
    'never the literal question phrasing or a bare park-name alone.',
  christianity:
    'If the input looks like Christianity SE questions (CHRISTIAN THEOLOGY / DENOMINATIONAL DOCTRINE / ' +
    'BIBLICAL EXEGESIS / CHURCH HISTORY / SACRAMENTS / LITURGY / SPIRITUAL FORMATION — sourced and ' +
    'denominationally framed across catholic / orthodox / protestant / evangelical traditions, NOT ' +
    'general religious-studies and NOT secular church-news — "What does [denomination] teach about …", ' +
    '"How is [doctrine] grounded in scripture", "Why do [tradition] practice …", "What is the difference ' +
    'between [position-A] and [position-B]"), distill to the christian-doctrine/practice concept ' +
    '(e.g. "trinity ontological economic", "hypostatic union", "two natures christology", "chalcedonian ' +
    'definition", "monothelitism dyothelitism", "filioque procession spirit", "homoousios homoiousios", ' +
    '"arianism orthodoxy", "nestorianism cyril", "monophysitism miaphysitism", "iconoclasm ' +
    'controversy", "schism east west 1054", "papal infallibility", "magisterium ordinary extraordinary", ' +
    '"sola scriptura", "sola fide justification", "sola gratia grace alone", "solus christus", "soli ' +
    'deo gloria", "five solas reformation", "tulip calvinism", "arminianism prevenient grace", ' +
    '"molinism middle knowledge", "open theism foreknowledge", "predestination election", "covenant ' +
    'theology dispensationalism", "new covenant theology", "kingdom now realized eschatology", ' +
    '"premillennialism postmillennialism amillennialism", "rapture pretrib midtrib posttrib", "great ' +
    'tribulation seven years", "second coming parousia", "general resurrection judgment", "purgatory ' +
    'intermediate state", "annihilationism conditionalism", "universalism apokatastasis", "hell eternal ' +
    'conscious torment", "limbo unbaptized infants", "indulgences treasury merits", "transubstantiation ' +
    'eucharist", "consubstantiation lutheran", "memorialism zwinglian", "real presence spiritual", ' +
    '"baptismal regeneration", "credobaptism paedobaptism", "infant baptism covenant", "believers ' +
    'baptism immersion", "confirmation chrismation", "anointing sick extreme unction", "reconciliation ' +
    'penance auricular confession", "marriage indissoluble annulment", "ordination apostolic ' +
    'succession", "holy orders bishop priest deacon", "celibacy clerical western", "married priests ' +
    'eastern", "veneration saints intercession", "marian dogmas immaculate assumption", "perpetual ' +
    'virginity mary", "theotokos mother god", "communion saints", "icon veneration prayer", "relics ' +
    'second commandment", "deuterocanonical apocrypha protestant", "biblical inerrancy infallibility", ' +
    'plenary verbal inspiration", "historical critical method", "redemptive historical hermeneutic", ' +
    '"typology figural reading", "allegorical literal anagogical tropological", "patristic exegesis ' +
    'fathers", "augustine grace pelagius", "aquinas summa scholasticism", "luther 95 theses", ' +
    '"calvin institutes", "wesley sanctification entire", "edwards revival awakening", "barth ' +
    'neoorthodoxy", "bultmann demythologizing", "moltmann hope theology", "liberation theology ' +
    'gutierrez", "feminist theology womanist", "black theology cone", "process theology cobb", ' +
    '"radical orthodoxy milbank", "evangelical inerrancy chicago", "pentecostalism initial evidence", ' +
    '"charismatic spiritual gifts cessationism continuationism", "speaking tongues glossolalia", ' +
    '"healing miracles signs wonders", "anglican via media", "methodist quadrilateral", "baptist ' +
    'distinctives autonomy", "presbyterian polity elders", "episcopal succession bishops", ' +
    '"congregational autonomy local", "monasticism desert fathers", "benedictine rule liturgy hours", ' +
    '"ignatian spirituality discernment", "carmelite contemplation", "lectio divina prayer", "centering ' +
    'prayer apophatic", "jesus prayer hesychasm", "rosary marian devotion", "stations cross via ' +
    'dolorosa") — never the literal question phrasing or a bare verse reference alone.',
  datascience:
    'If the input looks like Data Science SE questions (APPLIED ML / DATA SCIENCE PRACTICE / FEATURE ' +
    'ENGINEERING / MODEL DEPLOYMENT / DATA PIPELINES — practitioner-framed, NOT pure-theory ai.SE and ' +
    'NOT pure-statistics crossvalidated.SE — "How do I preprocess …", "Which model should I use for …", ' +
    '"How do I evaluate …", "What is the best way to handle imbalanced …"), distill to the applied-ml ' +
    'concept (e.g. "feature engineering categorical", "one hot encoding cardinality", "target encoding ' +
    'leakage", "label encoding ordinal", "missing data imputation", "knn imputation iterative", "mice ' +
    'multiple imputation", "outlier detection isolation forest", "robust scaling iqr", "min max ' +
    'standardization zscore", "imbalanced classes smote adasyn", "class weight rebalancing", "stratified ' +
    'kfold cross validation", "time series split validation", "leakage feature target", "data drift ' +
    'detection", "concept drift monitoring", "covariate shift adaptation", "train test split ' +
    'stratified", "holdout validation pitfalls", "nested cross validation", "hyperparameter tuning ' +
    'grid random", "bayesian optimization optuna", "early stopping patience", "learning rate ' +
    'scheduling", "warmup cosine annealing", "batch size lr scaling", "gradient accumulation memory", ' +
    '"mixed precision training", "gradient clipping exploding", "weight decay regularization", "dropout ' +
    'p tuning", "batch norm layer norm", "label smoothing crossentropy", "focal loss imbalanced", ' +
    '"contrastive loss triplet", "feature selection mutual information", "recursive feature elimination", ' +
    '"lasso regularization l1", "ridge regression l2", "elastic net mix", "principal component ' +
    'analysis", "tsne umap visualization", "autoencoder dimensionality reduction", "embedding spaces ' +
    'word2vec", "glove fasttext embeddings", "bert sentence embeddings", "tfidf bag words", "ngram ' +
    'features text", "stemming lemmatization preprocessing", "stop word removal language", "tokenizer ' +
    'subword bpe", "wordpiece sentencepiece", "padding truncation sequence", "attention masking ' +
    'transformer", "positional encoding rotary", "fine tuning pretrained", "lora peft adaptation", ' +
    '"prompt engineering few shot", "instruction tuning rlhf", "rag retrieval augmented", "vector ' +
    'database indexing", "approximate nearest neighbor", "hnsw faiss annoy", "embedding similarity ' +
    'cosine", "reranking cross encoder", "chunking strategy overlap", "evaluation metrics precision ' +
    'recall", "f1 macro micro weighted", "auc roc curve", "pr curve auprc", "confusion matrix multiclass", ' +
    '"calibration brier score", "platt scaling isotonic", "shap values explainability", "lime local ' +
    'explanation", "permutation feature importance", "partial dependence plots", "ice individual ' +
    'conditional", "model card datasheet", "model deployment serving", "tensorflow serving onnx", ' +
    '"triton inference server", "kserve seldon mlflow", "model registry versioning", "ab test deployment", ' +
    '"shadow deploy canary", "blue green model", "monitoring production drift", "feature store online ' +
    'offline", "feast tecton hopsworks", "data versioning dvc", "lakefs delta lake", "experiment ' +
    'tracking mlflow", "wandb tensorboard neptune", "reproducibility seeds determinism", "pipeline ' +
    'orchestration airflow", "kubeflow argo metaflow", "great expectations validation", "deequ data ' +
    'quality", "schema enforcement avro", "parquet columnar storage", "spark distributed compute", ' +
    '"dask polars pandas", "vaex out core", "rapids cudf gpu", "etl elt patterns", "medallion ' +
    'architecture bronze silver gold", "slowly changing dimensions", "scd type 2 history", "cdc change ' +
    'data capture", "lambda kappa architecture", "stream processing flink", "kafka topic partitioning", ' +
    '"exactly once semantics", "watermarks event time", "window aggregations tumbling sliding") — ' +
    'never the literal question phrasing or a bare library name alone.',
  writers:
    'If the input looks like Writing SE questions (CREATIVE WRITING CRAFT / FICTION TECHNIQUE / ' +
    'STORY STRUCTURE / CHARACTER DEVELOPMENT / PROSE STYLE / WORLDBUILDING / NARRATIVE PERSPECTIVE / ' +
    'PUBLISHING & EDITING — author-craft framed, NOT linguistics phonology / morphology and NOT ' +
    'english-language usage — "How do I write …", "What is the best way to show …", "How can I make ' +
    'my [character / scene / dialogue] …"), distill to the writing-craft concept (e.g. "show dont ' +
    'tell prose", "free indirect discourse", "interior monologue technique", "stream of consciousness", ' +
    'unreliable narrator framing", "frame story embedded narrative", "third person limited", "third ' +
    'person omniscient", "first person retrospective", "second person rare voice", "epistolary novel ' +
    'form", "in medias res opening", "hook chapter one", "ticking clock tension", "dramatic irony ' +
    'reveal", "chekhov gun setup", "foreshadowing planting", "red herring misdirection", "macguffin ' +
    'plot device", "deus ex machina avoid", "conflict types internal external", "stakes raising ' +
    'midpoint", "midpoint reversal", "all is lost moment", "dark night of soul", "pinch points ' +
    'pressure", "save the cat beat sheet", "three act structure", "five act dramatic arc", "freytag ' +
    'pyramid", "heros journey monomyth", "campbell departure initiation return", "vogler twelve stages", ' +
    '"seven point story structure", "snowflake method outline", "scene sequel pattern", "yes but no ' +
    'and disasters", "MICE quotient elements", "tentpole scenes anchor", "pacing slow burn vs ' +
    'breakneck", "white room syndrome setting", "iceberg theory hemingway", "imagery sensory detail", ' +
    '"metaphor extended controlling", "synecdoche metonymy", "chiasmus parallelism rhetoric", ' +
    '"polysyndeton asyndeton lists", "sentence rhythm cadence", "varied sentence length", "active vs ' +
    'passive voice", "filter words distance", "telling adjectives crutch", "dialogue tags said vs ' +
    'fancy", "beats action tags", "subtext below dialogue", "voice consistency narrator", "register ' +
    'formal informal", "diction word choice", "purple prose overwriting", "minimalist iceberg style", ' +
    '"maximalist baroque style", "characterization round vs flat", "character arc transformation ' +
    'change", "want vs need protagonist", "ghost backstory wound", "lie character believes", "moral ' +
    'argument theme", "antagonist motivation believable", "antihero gray morality", "ensemble cast ' +
    'managing", "viewpoint shifts breaks", "head hopping pov error", "character voice distinct", ' +
    '"worldbuilding magic system rules", "sanderson laws magic", "hard vs soft magic", "secondary ' +
    'world building", "fantasy nomenclature naming", "scifi extrapolation rigor", "alien biology ' +
    'plausibility", "future tech believability", "alt history divergence point", "exposition ' +
    'infodump avoid", "as you know bob", "iceberg principle reveal", "showing world through action", ' +
    '"theme emergent vs imposed", "motif recurring image", "symbol vs allegory", "tone mood ' +
    'distinguishing", "atmosphere setting evoking", "setting as character", "research authenticity ' +
    'accuracy", "diversity sensitivity reading", "trope subversion vs cliche", "genre conventions ' +
    'expectations", "subgenre reader contract", "comp titles market positioning", "querying agents ' +
    'process", "synopsis condensed plot", "blurb back cover hook", "logline elevator pitch", ' +
    '"pitch contests twitter", "first ten pages workshop", "alpha beta readers feedback", "self ' +
    'editing developmental line copy", "kill darlings cut", "second draft revision pass", "beta ' +
    'reader survey questionnaire", "self publishing kdp wide", "traditional publishing big five", ' +
    'hybrid author career", "rights reverted backlist", "audiobook narration acx", "translation ' +
    'rights foreign", "fan fiction transformative") — never the literal question phrasing or a bare ' +
    'author name alone.',
  vegetarianism:
    'If the input looks like Vegetarianism SE questions (PLANT-BASED DIET / VEGAN COOKING / NUTRITIONAL ' +
    'COMPLETENESS / MEAT SUBSTITUTES / ETHICAL FOOD CHOICES — practitioner-framed dietary practice, ' +
    'NOT general cooking technique and NOT pet nutrition — "How do I get enough …", "What is a good ' +
    'substitute for …", "Is [ingredient/product] vegan", "How do I [transition/cook/balance] …"), ' +
    'distill to the plant-based-diet concept (e.g. "vitamin b12 supplementation", "iron absorption non ' +
    'heme", "vitamin c iron pairing", "calcium plant sources", "vitamin d2 vs d3 vegan", "omega 3 ala ' +
    'epa dha", "algae oil dha source", "complete protein combining", "lysine deficient grains", ' +
    '"essential amino acids", "tofu pressing technique", "tempeh fermentation", "seitan vital wheat ' +
    'gluten", "tvp textured vegetable protein", "jackfruit pulled meat", "aquafaba egg replacement", ' +
    '"flax egg ground seeds", "chia egg substitute", "silken tofu binder", "cashew cream sauce", ' +
    '"nutritional yeast cheese", "coconut cream whip", "vegan butter alternatives", "milk substitutes ' +
    'oat almond soy", "fortified plant milk", "rennet free cheese", "vegan honey alternatives agave ' +
    'maple", "gelatin alternatives agar", "carmine cochineal vegan", "isinglass beer wine filtration", ' +
    '"l cysteine bread", "casein whey hidden", "shellac confectioners glaze", "lacto ovo classification", ' +
    '"pescatarian flexitarian definitions", "lacto vegetarian dairy", "ovo vegetarian eggs", "vegan ' +
    'lifestyle no animal products", "raw vegan diet", "fruitarian extreme variant", "whole food plant ' +
    'based wfpb", "macrobiotic diet philosophy", "ahimsa nonviolence diet", "ethical sourcing leather ' +
    'alternative", "factory farming concerns", "sustainable agriculture", "carbon footprint food", ' +
    '"land water use livestock", "transition gradual phase", "bone broth alternatives", "iron pots ' +
    'cookware", "cast iron iron leaching", "soy isoflavones controversy", "phytate antinutrient ' +
    'soaking", "oxalate kidney stone risk", "spinach calcium bioavailability", "leafy green ' +
    'oxalates", "legume preparation soaking", "lectin antinutrient cooking", "sprouting grains ' +
    'legumes", "fermentation plant foods", "sauerkraut kimchi probiotics", "miso paste fermented", ' +
    '"natto vitamin k2", "vitamin k2 mk7 plant", "zinc bioavailability", "selenium brazil nut", ' +
    '"iodine sea vegetables", "sea salt iodized", "kelp dulse iodine", "choline egg alternative", ' +
    '"taurine cat vegan myth", "creatine vegan supplement", "carnitine supplementation", "vegan ' +
    'pregnancy nutrition", "breastfeeding vegan adequacy", "child vegan diet planning", "athlete ' +
    'plant based protein", "hidden animal ingredients", "vegan label certification", "cross ' +
    'contamination kitchen", "restaurant ordering vegan", "social pressure family", "honey ' +
    'controversy vegan") — never the literal question phrasing or a bare brand/product name alone.',
  coffee:
    'If the input looks like Coffee SE questions (SPECIALTY COFFEE / BREWING / ROASTING / ESPRESSO / ' +
    'GRINDING / EQUIPMENT / ORIGIN / SENSORY EVALUATION — aficionado-framed coffee craft, NOT general ' +
    'cooking and NOT cafe business — "How do I dial in …", "Why does my [pour over / espresso / shot] …", ' +
    '"What is the best [grinder / dose / temp] for …", "How do I [pull / extract / steam] …"), distill ' +
    'to the coffee concept (e.g. "specialty coffee scaa scoring", "single origin vs blend", "third ' +
    'wave coffee", "arabica vs robusta", "varietal genetics typica bourbon", "geisha gesha varietal", ' +
    'sl28 sl34 kenyan", "natural processed dry", "washed processed wet", "honey processed semi", ' +
    '"anaerobic fermentation", "carbonic maceration coffee", "cherry processing fermentation", "green ' +
    'bean storage humidity", "moisture content green", "first crack roast development", "second crack ' +
    'dark", "rate of rise roasting", "development time ratio", "agtron color score", "roast curve ' +
    'profile", "drum vs fluid bed roaster", "behmor sweet maria home", "ikawa sample roaster", ' +
    '"cupping protocol scaa", "fragrance aroma cupping", "flavor wheel descriptors", "acidity vs ' +
    'sourness", "body mouthfeel coffee", "aftertaste finish", "extraction yield tds", "vst refractometer ' +
    'measurement", "sca brewing control chart", "brew ratio coffee water", "golden cup standard", ' +
    'pour over technique v60", "kalita wave flat bed", "chemex thick filter", "aeropress recipes", ' +
    '"french press immersion", "moka pot stovetop", "siphon vacuum pot", "cold brew concentrate", ' +
    'japanese iced flash chilled", "steep time immersion", "bloom phase degassing", "co2 fresh ' +
    'beans", "rest period after roast", "freshness window peak", "espresso machine boiler types", ' +
    '"single dual boiler", "heat exchanger e61", "lever vs pump espresso", "9 bar pressure profile", ' +
    'pre infusion ramp pressure", "flow profiling slayer", "naked portafilter spritzing", "channeling ' +
    'puck distribution", "wdt distribution tool", "puck screen mesh", "tamping pressure even", "dose ' +
    'basket size 18 20 22", "ridgeless vs ridged basket", "imex pesado tamp", "grinder burr conical ' +
    'flat", "burr alignment shimming", "stepped vs stepless adjustment", "single dose grinder", ' +
    'workflow grinder retention", "rdt water spritz", "popcorning grinder issue", "fines distribution ' +
    'bimodal", "particle size sieve analysis", "sweet spot dial in", "ratio in out time", "shot ' +
    'profiling dragon decent", "milk steaming microfoam texture", "stretch incorporation steam", ' +
    'latte art rosetta heart", "free pour technique", "etching latte art", "milk types whole oat ' +
    'almond", "barista milk frothing", "cleaning espresso backflush", "cafiza puly caff detergent", ' +
    'descaling water hardness", "water quality tds gh kh", "third wave water recipe", "bypass mineral ' +
    'reverse osmosis", "ph water brewing", "water filtration coffee", "decaffeination swiss water ' +
    'ethyl acetate", "co2 supercritical decaf", "caffeine content variables", "matcha vs coffee energy ' +
    'comparison", "yerba mate alternative") — never the literal question phrasing or a bare ' +
    'machine/grinder brand alone.',
  travel:
    'If the input looks like Travel SE questions (INTERNATIONAL TRAVEL / VISAS & IMMIGRATION / AIRLINE ' +
    'OPS / CUSTOMS & BORDERS / TRANSIT / DESTINATION LOGISTICS / TRAVEL DOCUMENTS — tourist & traveler ' +
    'frame, NOT relocation/visa-for-residency expatriates SE and NOT outdoor recreation outdoors SE — ' +
    '"Do I need a visa for …", "How do I transit through …", "What documents do I need to …", "Can I ' +
    '[bring/take/declare] …"), distill to the travel concept (e.g. "schengen 90 180 rule", "schengen ' +
    'short stay visa", "esta usa visa waiver", "eta canada electronic travel authorization", "eta uk ' +
    'electronic travel authorisation", "etias eu authorization", "transit visa airside landside", ' +
    '"airside transit without visa", "international transit area", "passport six month rule", ' +
    'passport blank pages requirement", "passport damage acceptance", "emergency travel document", ' +
    '"visa on arrival countries", "visa free reciprocity", "double entry visa", "multiple entry visa ' +
    'validity", "visa overstay penalty", "deportation overstay record", "schengen entry exit system ' +
    'ees", "biometric registration airport", "automated passport control kiosk", "global entry ttp ' +
    'enrollment", "tsa precheck", "nexus card us canada", "sentri us mexico", "apec business travel ' +
    'card", "iata travel center", "timatic visa database airline", "denied boarding visa", "fit to ' +
    'fly certificate medical", "yellow fever certificate icvp", "polio vaccination certificate", ' +
    'malaria prophylaxis countries", "duty free allowance customs", "currency declaration limit", ' +
    'cash declaration form 105", "customs red green channel", "personal effects allowance", ' +
    '"prohibited items food meat", "agricultural inspection items", "lithium battery flight rules", ' +
    '"powerbank carry on watt hour", "liquid 100ml 3 1 1 rule", "tsa approved lock luggage", "checked ' +
    'baggage weight allowance", "carry on size dimensions iata", "personal item second bag", "basic ' +
    'economy fare restrictions", "interlining vs codeshare", "self transfer protected itinerary", ' +
    'minimum connecting time mct", "denied boarding compensation eu261", "european flight delay ' +
    'compensation", "involuntary downgrade refund", "luggage delayed lost montreal", "interline ' +
    'baggage agreement", "bag drop online checkin", "boarding pass mobile printed", "fast track ' +
    'security premium", "lounge access priority pass", "credit card lounge benefit", "airline alliance ' +
    'star oneworld skyteam", "frequent flyer status earning", "elite tier benefits", "redemption ' +
    'mileage chart", "open jaw multi city ticket", "stopover free fare construction", "round the ' +
    'world ticket", "schengen border insurance", "travel insurance trip cancellation", "credit card ' +
    'travel insurance coverage", "embassy lost passport replacement", "notarial services consulate", ' +
    '"apostille document authentication", "drivers license international permit idp", "renting car ' +
    'abroad insurance", "toll road abroad sticker vignette", "hotel deposit incidentals", "airbnb ' +
    'cleaning fee dispute", "hostel dorm safety", "roaming sim esim international", "wifi calling ' +
    'abroad", "vpn travel restrictions", "cash atm foreign transaction fee", "dynamic currency ' +
    'conversion dcc avoid", "tipping culture by country", "vat refund tourist export", "tax free ' +
    'shopping global blue", "schengen vat refund process", "long haul jet lag adjustment", "circadian ' +
    'rhythm flight east west", "altitude hydration cabin pressure", "deep vein thrombosis dvt long ' +
    'flight", "child traveling alone consent letter", "minor parental authorization border", "pet ' +
    'travel iata pet container", "service animal flight rules", "emotional support animal", ' +
    '"wheelchair assistance airport", "religious requirements halal kosher meal") — never the literal ' +
    'question phrasing or a bare city/airline name alone.',
  fitness:
    'If the input looks like Physical Fitness SE questions (EXERCISE PROGRAMMING / RESISTANCE TRAINING ' +
    '/ HYPERTROPHY / STRENGTH / CARDIO PROGRAMMING / FORM & TECHNIQUE / RECOVERY / MOBILITY / SPORTS ' +
    'NUTRITION — practitioner-framed gym & training, NOT clinical sports medicine and NOT outdoor ' +
    'endurance — "How do I [build muscle / lose fat / improve form] …", "Why is my [lift / cardio / ' +
    'recovery] …", "What is the best [program / split / rep range] …"), distill to the fitness ' +
    'concept (e.g. "progressive overload principle", "volume intensity frequency", "rir reps in ' +
    'reserve", "rpe rate perceived exertion", "1rm one rep max calculation", "epleys brzycki rm ' +
    'formula", "training to failure proximity", "double progression linear", "wave loading periodization", ' +
    'block periodization training", "daily undulating periodization dup", "mesocycle macrocycle planning", ' +
    '"deload week recovery", "compound vs isolation lifts", "big three squat bench deadlift", "high ' +
    'bar low bar squat", "squat depth atg parallel", "knees over toes controversy", "hip drive ' +
    'squat cue", "valsalva maneuver bracing", "belt use lifting", "wrist wraps support", "knee ' +
    'sleeves wraps", "lifting straps grip", "deadlift conventional sumo", "stiff leg romanian rdl", ' +
    'hex bar trap deadlift", "bench press arch leg drive", "scapular retraction bench", "touch and ' +
    'go vs paused", "spotter etiquette safety", "barbell vs dumbbell hypertrophy", "machine vs free ' +
    'weight", "cable system advantages", "smith machine lockout", "rep tempo eccentric concentric", ' +
    'time under tension tut", "stretch reflex bounce", "lengthened partials emerging research", ' +
    '"mind muscle connection", "muscle activation emg", "muscle protein synthesis mps", "leucine ' +
    'threshold mtor", "anabolic window myth", "protein per meal distribution", "protein 0.7 1g per ' +
    'pound", "calorie surplus deficit", "tdee calculation harris benedict", "macronutrient split ' +
    'p f c", "creatine monohydrate loading", "creatine 5g daily maintenance", "beta alanine tingles ' +
    'paresthesia", "caffeine pre workout dose", "citrulline malate pump", "arginine vs citrulline", ' +
    '"bcaa eaa controversy", "glutamine endurance recovery", "ashwagandha cortisol", "tongkat ali ' +
    'fadogia agrestis", "natural testosterone optimization", "training fasted vs fed", "intermittent ' +
    'fasting performance", "carb timing peri workout", "whey casein digestion", "isolate concentrate ' +
    'whey", "plant protein blend", "creatine non responder", "magnesium deficiency cramping", ' +
    'electrolyte sodium potassium", "hydration during training", "sleep recovery 7 9 hours", "sleep ' +
    'debt training", "rest interval hypertrophy 60 90 sec", "rest interval strength 3 5 min", "5x5 ' +
    'starting strength", "stronglifts beginner program", "greyskull gslp", "ppl push pull legs", ' +
    'upper lower split", "bro split antiquated", "full body 3x week", "arnold split twice", "5 3 1 ' +
    'wendler", "smolov squat program", "sheiko russian", "concurrent training interference", "cardio ' +
    'hypertrophy attenuation", "hiit vs liss cardio", "zone 2 cardio aerobic base", "lactate ' +
    'threshold zone 4", "vo2 max intervals zone 5", "norwegian 4x4 hiit", "couch to 5k beginner", ' +
    'rate of perceived exertion", "heart rate zones karvonen", "hr max formula 220 age inaccurate", ' +
    '"running cadence stride", "rope skipping conditioning", "doms delayed onset soreness", "active ' +
    'recovery walking", "foam rolling myofascial release", "static vs dynamic stretching", "pnf ' +
    'stretching technique", "mobility vs flexibility", "ankle dorsiflexion squat", "hip mobility ' +
    'shoulder mobility", "thoracic spine extension", "anterior pelvic tilt", "lower cross syndrome", ' +
    'rotator cuff impingement", "tennis elbow lateral epicondylitis", "patellar tendonitis jumpers ' +
    'knee", "shin splints mtss", "plantar fasciitis recovery", "kinesio tape effectiveness", ' +
    'compression sleeve recovery", "ice cold therapy controversy", "cwi cold water immersion ' +
    'attenuation hypertrophy", "sauna heat acclimation", "cardiac drift longer sessions", "minimum ' +
    'effective dose volume", "junk volume diminishing returns", "specificity principle adaptation") — ' +
    'never the literal question phrasing or a bare brand/supplement name alone.',
  ethereum:
    'If the input looks like Ethereum SE questions (SMART CONTRACTS / SOLIDITY / EVM / GAS / WALLETS / ' +
    'NODES / LAYER-2 / DEFI / NFTS / CONSENSUS — developer-framed Ethereum & EVM-chain craft, NOT ' +
    'speculative trading and NOT layer-1 alternatives — "How do I [deploy / verify / call] …", "Why ' +
    'does my [transaction / contract / gas estimate] …", "What is the difference between [opcode / ' +
    'standard / fork] …"), distill to the ethereum concept (e.g. "evm bytecode opcodes", "solidity ' +
    'storage layout", "function selector calldata", "abi encoding decoding", "erc 20 token standard", ' +
    '"erc 721 nft standard", "erc 1155 multi token", "erc 4626 vault standard", "erc 4337 account ' +
    'abstraction", "eip 1559 fee market", "base fee priority fee tip", "gas optimization patterns", ' +
    '"reentrancy guard checks effects interactions", "delegatecall proxy storage collision", ' +
    '"upgradeable proxy uups transparent", "diamond standard erc 2535 facets", "create2 deterministic ' +
    'address", "proxy admin owner upgrade", "openzeppelin contracts library", "slither static analyzer", ' +
    '"mythril symbolic execution", "echidna fuzzing property", "foundry forge anvil cast", "hardhat ' +
    'plugins network", "truffle ganache legacy", "remix ide solidity browser", "viem ethers web3 js ' +
    'client", "wagmi rainbowkit walletconnect", "metamask wallet provider eip 1193", "json rpc eth ' +
    'methods", "websocket subscription events log", "block gas limit", "merkle patricia trie state", ' +
    '"merkle proof inclusion", "verkle tree state", "the merge proof of stake", "beacon chain validators", ' +
    '"slashing condition penalty", "withdrawals push pull", "mev maximum extractable value", "flashbots ' +
    'bundle private mempool", "sandwich attack frontrun", "order flow auction", "private rpc protect", ' +
    '"layer 2 rollup optimistic", "arbitrum nitro stack", "optimism bedrock op stack", "fraud proof ' +
    'window challenge", "zk rollup validity proof", "starknet stark cairo", "zksync era boojum", ' +
    '"polygon zk evm equivalence", "data availability calldata blob", "eip 4844 proto danksharding", ' +
    '"blob transactions kzg", "sequencer decentralization", "bridges canonical native", "lock and ' +
    'mint burn and unlock", "wormhole multichain", "uniswap v2 v3 v4 amm", "concentrated liquidity ' +
    'tick range", "constant product invariant xy k", "stableswap curve invariant", "lending protocols ' +
    'aave compound", "liquidation health factor", "oracle price feeds chainlink", "twap moving average", ' +
    '"flash loan callback", "yield farming staking lp", "lst lrt liquid restaking", "eigenlayer ' +
    'restaking avs") — never the literal question phrasing or a bare token/protocol name alone.',
  skeptics:
    'If the input looks like Skeptics SE questions (CLAIM EVALUATION / SCIENTIFIC SCRUTINY / RATIONALIST ' +
    'DEBUNKING / EVIDENCE STANDARDS / NOTABLE CLAIMS / MISINFORMATION ANALYSIS — claim-checking framed, ' +
    'NOT general philosophy of science — "Is it true that …", "Did [person/group] say …", "Does ' +
    '[claim/product/treatment] actually work …"), distill to the skeptical-inquiry concept (e.g. ' +
    '"burden of proof argumentation", "russells teapot", "extraordinary claims evidence", "occams razor ' +
    'parsimony", "falsifiability popper", "p value statistical significance", "publication bias ' +
    'meta analysis", "replication crisis psychology", "p hacking garden forking paths", "preregistration ' +
    'open science", "systematic review cochrane", "randomized controlled trial gold standard", ' +
    '"placebo effect mechanism", "regression to the mean", "selection bias sampling", "survivorship ' +
    'bias", "confirmation bias motivated reasoning", "dunning kruger effect critique", "appeal to ' +
    'authority fallacy", "ad hominem argument", "straw man fallacy", "no true scotsman", "moving the ' +
    'goalposts", "gish gallop debate", "cherry picking evidence", "anecdotal vs empirical", "correlation ' +
    'causation distinction", "post hoc ergo propter hoc", "texas sharpshooter fallacy", "homeopathy ' +
    'dilution implausibility", "acupuncture sham trials", "chiropractic spinal manipulation evidence", ' +
    '"naturopathy quack", "detox cleanse pseudoscience", "alkaline diet myth", "anti vaccine claims ' +
    'rebutted", "creationism intelligent design rebutted", "flat earth rebutted", "moon landing ' +
    'rebutted", "9 11 conspiracy rebutted", "chemtrails contrails", "5g health claims", "qanon ' +
    'conspiracy", "flat earth", "lemurian atlantis pseudohistory", "ancient aliens pseudoscience", ' +
    '"crystal healing", "magnet therapy", "essential oils therapeutic claims", "mlm structure pyramid", ' +
    '"snake oil patent medicine", "bigfoot sasquatch evidence", "loch ness", "ufo uap unidentified", ' +
    '"crop circles", "psychic mediumship cold reading", "facilitated communication debunked", "subliminal ' +
    'priming replication", "power posing replication failure", "stanford prison critique", "milgram ' +
    'replication", "implicit association test reliability") — never the literal question phrasing or ' +
    'a bare claimant name alone.',
  emacs:
    'If the input looks like Emacs SE questions (EMACS POWER-USER / ELISP / ORG-MODE / MODES & MAJOR ' +
    'PACKAGES / CONFIG & INIT / KEY BINDINGS — emacs-craft framed, NOT general consumer computing — ' +
    '"How do I [bind / configure / extend] …", "Why does [my init / mode / hook] …", "What is the ' +
    'best [package / setup / workflow] …"), distill to the emacs concept (e.g. "elisp lambda lexical ' +
    'binding", "advice nadvice function wrap", "hook abnormal hook", "buffer local variable", ' +
    '"window frame distinction", "minibuffer completion read", "ido vertico ivy helm completion", ' +
    '"selectrum embark consult", "company corfu autocomplete", "yasnippet template expansion", ' +
    '"projectile project management", "magit git porcelain", "git timemachine blame", "use package ' +
    'declarative config", "straight el package manager", "elpaca async parallel install", "package ' +
    'el melpa archive", "doom emacs framework", "spacemacs vim layer", "evil mode vim emulation", ' +
    '"god mode modal editing", "meow modal editing", "key chord sequence", "which key discoverable ' +
    'keys", "general el leader key", "transient prefix command", "treemacs neotree dired sidebar", ' +
    '"dired find sort filter", "tramp remote editing ssh", "eshell elisp shell", "vterm libvterm ' +
    'terminal", "shell mode comint", "ansi color compilation", "compilation mode error parser", ' +
    '"flycheck flymake lint", "lsp mode eglot client", "tree sitter syntax", "treesit major mode", ' +
    '"smartparens paredit structural", "rainbow delimiters paren", "lispy parinfer", "org mode ' +
    'outline export", "org capture template", "org agenda views", "org babel literate", "org roam ' +
    'zettelkasten", "denote notes file naming", "deft note search", "org publish html export", "ox ' +
    'pandoc latex export", "org tangle code blocks", "org table calc spreadsheet", "calc gnu ' +
    'calculator", "ediff diff merge", "smerge conflict resolution", "vc mode version control", ' +
    '"forge github gitlab issues", "consult ripgrep grep", "deadgrep ripgrep search", "embark act ' +
    'export collect", "marginalia annotations", "savehist desktop save", "recentf recent files", ' +
    '"bookmark bmenu", "winner mode window history", "ace window jump", "buffer move switch", "tab ' +
    'bar tabs workspace") — never the literal question phrasing or a bare package name alone.',
  mythology:
    'If the input looks like Mythology SE questions (MYTH CANON / FOLKLORE / DEITIES & PANTHEONS / ' +
    'MYTHIC NARRATIVE / COMPARATIVE MYTHOLOGY / FOLK BELIEF — mythography framed, NOT religious-doctrine ' +
    'theology and NOT modern fiction — "Who was [deity/figure] in [tradition] …", "What is the origin ' +
    'of [myth/symbol] …", "Why does [myth/folklore element] …"), distill to the mythological concept ' +
    '(e.g. "greek pantheon olympian", "titanomachy gigantomachy", "homeric hymns iliad odyssey", ' +
    '"hesiod theogony cosmogony", "orphic mysteries", "eleusinian mysteries demeter", "dionysian ' +
    'cult", "roman pantheon interpretatio", "roman deification syncretism", "norse myth eddas ' +
    'voluspa", "snorri prose edda", "ragnarok eschatology", "yggdrasil world tree", "aesir vanir ' +
    'truce", "midgard nine worlds", "loki trickster", "valkyrie chooser slain", "celtic mythology ' +
    'mabinogion", "tuatha de danann", "irish ulster cycle cu chulainn", "welsh mabinogi", "egyptian ' +
    'pantheon ennead", "ra horus osiris isis", "book of the dead amduat", "ammit weighing heart", ' +
    '"mesopotamian myth enuma elish", "epic of gilgamesh", "sumerian inanna descent", "akkadian ' +
    'ishtar", "hittite myth", "ugaritic baal cycle", "hindu mythology vedas", "puranas itihasa", ' +
    '"ramayana mahabharata", "trimurti brahma vishnu shiva", "avatars dashavatara", "buddhist ' +
    'mythology jataka", "tibetan bardo", "japanese shinto kami", "kojiki nihon shoki", "amaterasu ' +
    'sun goddess", "yokai folk creature", "korean mythology dangun", "chinese myth fuxi nuwa", "yellow ' +
    'emperor xuanyuan", "journey to the west legend", "polynesian myth maui", "hawaiian pele", ' +
    '"aboriginal dreamtime", "native american trickster coyote", "mesoamerican aztec quetzalcoatl", ' +
    '"popol vuh maya", "inca viracocha", "african myth anansi", "yoruba orisha", "slavic mythology ' +
    'perun", "baltic dievas", "finno ugric kalevala", "vainamoinen rune", "comparative mythology ' +
    'monomyth", "joseph campbell heros journey", "indo european reconstruction sky father", "axis ' +
    'mundi cosmic axis", "psychopomp soul guide", "trickster archetype") — never the literal question ' +
    'phrasing or a bare deity name alone.',
  crafts:
    'If the input looks like Crafts SE questions (HANDMADE CRAFT / FIBER / TEXTILE / PAPER / LEATHER ' +
    '/ METALWORK / JEWELRY / WOODCRAFT / MIXED MEDIA — practitioner-framed handmade craft, NOT industrial ' +
    'manufacturing and NOT pure visual art — "How do I [knit / sew / solder / glue] …", "What is the ' +
    'best [thread / needle / glue / finish] …", "Why does my [project / stitch / weld] …"), distill ' +
    'to the craft concept (e.g. "knitting cast on bind off", "knit purl stockinette", "garter stitch ' +
    'rib", "lace knitting yarn over", "fair isle stranded colorwork", "intarsia colorwork", "double ' +
    'knitting reversible", "brioche knitting", "circular needle magic loop", "double pointed needles ' +
    'dpn", "yarn weight gauge swatch", "wpi wraps per inch", "knitting tension consistent", "blocking ' +
    'finished piece", "crochet chain slip stitch", "single double treble crochet", "amigurumi magic ' +
    'ring", "tunisian crochet hook", "embroidery satin stitch", "french knot bullion", "cross stitch ' +
    'aida count", "needlepoint canvas", "punch needle rug", "tapestry loom weaving", "rigid heddle ' +
    'loom", "sewing seam allowance", "french seam flat felled", "interfacing fusible woven", "bias ' +
    'binding", "buttonhole stitch placket", "zipper invisible installation", "quilt piecing patchwork", ' +
    '"foundation paper piecing fpp", "english paper piecing epp", "appliqué fusible needle turn", ' +
    '"machine quilting free motion", "longarm quilting", "felting wet needle", "wool roving fleece", ' +
    '"spinning wheel drafting", "drop spindle worsted woolen", "natural dyes mordant", "indigo vat ' +
    'shibori", "tie dye reactive procion", "ice dye snow", "block printing linocut", "screen printing ' +
    'photo emulsion", "paper marbling suminagashi", "origami fold valley mountain", "kirigami cut", ' +
    'paper crafting cardstock score", "bookbinding coptic stitch", "perfect binding case", "leather ' +
    'tooling stamp", "leather edge bevel burnish", "saddle stitch leatherwork", "rivet snap setter", ' +
    'jewelry wire wrapping", "soldering silver flux", "lost wax casting", "metal stamping punch", ' +
    'beading peyote brick stitch", "loom beading bracelet", "polymer clay bake", "soap making cold ' +
    'process", "candle making wick fragrance", "resin epoxy pouring", "mosaic tessellation grout", ' +
    'macrame square knot", "pottery wheel throwing centering", "hand building coil slab", "glaze ' +
    'firing kiln cone") — never the literal question phrasing or a bare brand/yarn name alone.',
  italian:
    'If the input looks like Italian Language SE questions (ITALIAN GRAMMAR / VOCABULARY / IDIOMATIC ' +
    'USAGE / DIALECTS / ETYMOLOGY / PRONUNCIATION — Italian-language-craft framed, NOT general Romance ' +
    'linguistics and NOT culture-only — "How do I say [phrase] in Italian …", "What is the difference ' +
    'between [word/word] …", "Why does Italian use [construction] …"), distill to the italian concept ' +
    '(e.g. "passato prossimo trapassato", "imperfetto vs passato remoto", "congiuntivo presente ' +
    'imperfetto", "subjunctive triggers che", "condizionale presente passato", "futuro semplice ' +
    'anteriore", "gerundio progressive stare", "participio passato agreement", "essere vs avere ' +
    'auxiliary", "reflexive verbs si pronominali", "verbi pronominali farcela cavarsela", "modal ' +
    'verbs potere dovere volere", "direct indirect object pronouns", "ne ci particles", "combined ' +
    'pronouns glielo", "stressed unstressed pronouns", "definite article il lo la i gli le", ' +
    '"contractions con preposizioni", "preposition a in di da", "prepositional verbs", "noun ' +
    'gender exceptions", "plural irregularities uomo uomini", "false friends english italian", ' +
    '"cognates latinate", "diminutives augmentatives suffixes", "affettivo vezzeggiativo", "elision ' +
    'apocope", "double consonants gemination", "stress penultimate antepenultimate", "open closed e ' +
    'o vowels", "rolled r consonant", "gli digraph palatal", "sci sce phoneme", "word order italian ' +
    'svo flexible", "topic comment cleft", "interrogative inversion", "negative concord nessuno ' +
    'niente", "ci sta ci vuole expressions", "idioms in bocca al lupo", "proverbs detti", "regional ' +
    'dialects standard italian", "tuscan florence dialect", "neapolitan napoletano", "sicilian ' +
    'siciliano", "venetian veneto", "milanese lombardo", "romanesco roman", "code switching dialect ' +
    'italian", "etymology latin to italian", "vulgar latin sound changes", "western romance shift", ' +
    '"borrowed words anglicism", "false anglicism pseudo english", "loanwords from arabic", "tu vs ' +
    'lei formality", "voi plural formal", "ci dispiace excuse", "scusi vs scusami", "register ' +
    'formal informal", "cinema film televisione media language") — never the literal question ' +
    'phrasing or a bare regional dialect name alone.',
  russian:
    'If the input looks like Russian Language SE questions (RUSSIAN GRAMMAR / VOCABULARY / IDIOMATIC ' +
    'USAGE / DIALECTS / ETYMOLOGY / ORTHOGRAPHY / PRONUNCIATION — Russian-language-craft framed, NOT ' +
    'general Slavic linguistics and NOT culture-only — "How do I say [phrase] in Russian …", "What is ' +
    'the difference between [word/word] …", "Why does Russian use [construction/case] …"), distill to ' +
    'the russian concept (e.g. "russian noun cases six", "nominative accusative genitive", "dative ' +
    'instrumental prepositional", "case endings declension", "verb aspect perfective imperfective", ' +
    '"aspect pairs prefix", "verbs of motion idti khodit", "unidirectional multidirectional", "verb ' +
    'conjugation present", "past tense gender agreement", "future imperfective compound", "future ' +
    'perfective simple", "imperative mood formation", "subjunctive byl by", "participles active ' +
    'passive", "gerund deeprichastie", "reflexive verbs sya postfix", "verbal aspect pairs studying", ' +
    '"adjective short long form", "adjective declension hard soft", "comparative superlative", "noun ' +
    'gender masculine feminine neuter", "plural irregular endings", "soft sign hard sign", "vowel ' +
    'reduction unstressed o a", "stress mobile pattern", "yer letters historical", "yo ё diacritic ' +
    'usage", "soft consonants palatalization", "consonant clusters cluster", "fleeting vowels o e", ' +
    '"hard soft adjectives", "definite indefinite no articles", "word order flexible svo", "topic ' +
    'comment focus", "particle li interrogative", "particle zhe emphasis", "negative concord nikto ' +
    'nichego", "double negation", "russian numerals declension", "one two three counting", "telling ' +
    'time russian", "dates russian months", "address ty vy formality", "patronymic name otchestvo", ' +
    '"diminutive suffixes affectionate", "augmentative suffixes", "russian alphabet cyrillic", "old ' +
    'church slavonic", "ofitsial nyy reformist orthography", "1918 reform yat fita izhitsa", "ё ye ' +
    'optional letter", "russian idioms idiomy", "proverbs poslovitsy", "internet slang razgovornyy", ' +
    '"loanwords anglicism english", "gallicism french loans", "germanism german loans", "false ' +
    'friends english russian", "dialects northern southern", "moscow standard pronunciation", "akanye ' +
    'okanye", "stress patterns mobile", "russian etymology proto slavic", "old russian medieval", ' +
    '"church slavonic borrowings", "register formal informal") — never the literal question phrasing ' +
    'or a bare cyrillic word alone.',
  dba:
    'If the input looks like DBA SE questions (RELATIONAL DATABASE ADMINISTRATION / SQL TUNING / INDEX ' +
    'STRATEGY / QUERY PLANS / TRANSACTIONS & LOCKING / REPLICATION / BACKUP & RECOVERY / DATABASE ' +
    'INTERNALS — DBA-craft framed, NOT general programming and NOT data-science modeling — "How do I ' +
    '[index / partition / replicate] …", "Why is my [query / plan / lock] …", "What is the best ' +
    '[isolation level / backup strategy / replication topology] …"), distill to the dba concept (e.g. ' +
    '"b tree index leaf root", "covering index include columns", "composite index column order", ' +
    '"partial index filtered", "expression index functional", "hash index equality", "gin gist brin ' +
    'index postgres", "fillfactor pad index", "bloom filter index probabilistic", "bitmap index oracle", ' +
    '"index seek vs scan", "table scan full scan", "loop nested join", "hash join build probe", "merge ' +
    'join sorted", "join order optimizer", "query plan explain analyze", "estimated vs actual rows", ' +
    '"cardinality estimation statistics", "histogram statistics buckets", "parameter sniffing plan ' +
    'cache", "plan stability hint", "query store sql server", "automatic plan correction", "auto ' +
    'parameterization", "prepared statement plan", "connection pooling pgbouncer", "transaction ' +
    'isolation read committed", "repeatable read serializable", "snapshot isolation mvcc", "phantom ' +
    'read non repeatable", "deadlock detection victim", "lock escalation row page table", "row level ' +
    'locking innodb", "intent shared exclusive", "wait stats sql server", "wait event postgres", "wait ' +
    'class oracle", "buffer pool cache hit ratio", "shared buffers postgres", "innodb buffer pool size", ' +
    '"checkpoint wal log", "wal archive recovery", "point in time recovery pitr", "physical logical ' +
    'replication", "streaming replication postgres", "logical decoding wal", "binlog row statement ' +
    'mixed mysql", "gtid global transaction id", "replication lag seconds behind", "synchronous async ' +
    'replication", "quorum commit", "failover automatic switchover", "patroni pgcluster", "vacuum ' +
    'autovacuum bloat", "table bloat freeze xid wraparound", "frozen tuples vacuum freeze", "transaction ' +
    'id wraparound", "partitioning range list hash", "declarative partitioning postgres", "partition ' +
    'pruning constraint exclusion", "sharding horizontal scale", "citus distributed postgres", "vitess ' +
    'mysql sharding", "schema migration online ddl", "pt online schema change", "gh ost migration", ' +
    '"row format dynamic compressed", "tablespace storage", "temp tablespace sort spill", "temp table ' +
    'global local") — never the literal question phrasing or a bare table/server name alone.',
  cs:
    'If the input looks like CS Theory SE questions (THEORETICAL COMPUTER SCIENCE / ALGORITHMS & ' +
    'COMPLEXITY / AUTOMATA & FORMAL LANGUAGES / COMPUTABILITY / CRYPTOGRAPHY THEORY / DISCRETE MATH ' +
    'FOUNDATIONS — theory-craft framed, NOT applied programming and NOT data-applied ML — "What is the ' +
    'complexity of …", "Is [problem] in [class] …", "How do I [prove / reduce] …"), distill to the cs ' +
    'theory concept (e.g. "big o asymptotic notation", "big theta tight bound", "big omega lower bound", ' +
    '"little o strict upper", "amortized analysis aggregate", "amortized potential method", "master ' +
    'theorem recurrence", "akra bazzi recurrence", "divide and conquer recursion", "dynamic programming ' +
    'optimal substructure", "memoization tabulation", "greedy matroid exchange", "p np polynomial time", ' +
    '"np complete reduction karp", "np hard nphard", "polynomial reduction", "cook levin sat reduction", ' +
    '"3sat clique vertex cover", "hamiltonian cycle tsp", "subset sum partition", "knapsack 0 1 ' +
    'pseudo polynomial", "approximation ratio ptas fptas", "set cover approximation", "vertex cover ' +
    'approximation", "metric tsp christofides", "online algorithms competitive ratio", "ski rental ' +
    'problem", "secretary problem optimal stopping", "randomized algorithm las vegas monte carlo", ' +
    '"chernoff hoeffding bound", "markov chebyshev inequality", "expected value union bound", "linear ' +
    'programming simplex", "lp duality strong weak", "ip integer programming", "rounding lp relaxation", ' +
    '"max flow min cut ford fulkerson", "edmonds karp dinic", "bipartite matching hungarian", "stable ' +
    'matching gale shapley", "graph coloring chromatic", "regular language dfa nfa", "nfa to dfa ' +
    'subset construction", "regex pumping lemma", "context free grammar pda", "pumping lemma cfl", ' +
    'cyk parsing chomsky normal form", "lr parser shift reduce", "turing machine recursive enumerable", ' +
    '"halting problem undecidable", "rice theorem semantic", "diagonalization cantor", "kolmogorov ' +
    'complexity incompressibility", "shannon entropy information", "huffman optimal prefix code", ' +
    '"arithmetic coding range", "lempel ziv lz77 lz78", "bwt burrows wheeler", "polynomial hierarchy ' +
    'sigma pi delta", "ph collapse oracle", "pspace tqbf", "logspace nl reachability", "savitch ' +
    'theorem", "circuit complexity ac0 nc", "parity ac0 lower bound", "communication complexity ' +
    'set disjointness", "lambda calculus alpha beta", "church rosser confluence", "type theory simply ' +
    'typed", "system f polymorphism", "curry howard correspondence", "denotational operational ' +
    'semantics") — never the literal question phrasing or a bare algorithm/problem name alone.',
  cogsci:
    'If the input looks like Cognitive Sciences SE questions (COGNITION / PERCEPTION / DECISION-MAKING ' +
    '/ ATTENTION / MEMORY / NEUROSCIENCE OF MIND / PSYCHOLINGUISTICS / CONSCIOUSNESS — mind-science ' +
    'framed, NOT therapy-applied psychology and NOT skeptical-debunking — "How does the brain [process / ' +
    'represent / decide] …", "Why do humans [perceive / remember / err] …", "What is the relationship ' +
    'between [cognition / brain region / behavior] …"), distill to the cogsci concept (e.g. "working ' +
    'memory baddeley", "central executive phonological loop", "visuospatial sketchpad", "long term ' +
    'memory consolidation", "episodic semantic procedural", "declarative implicit memory", "encoding ' +
    'specificity context", "retrieval cue strength", "false memory misinformation", "recognition ' +
    'recall difference", "free recall serial position", "primacy recency effect", "chunking miller ' +
    'magical number", "iconic echoic sensory memory", "selective attention cocktail party", "divided ' +
    'attention dual task", "attentional blink", "inattentional blindness gorilla", "change blindness", ' +
    '"perceptual constancy size shape", "depth perception cues binocular", "monocular depth cues", ' +
    '"gestalt principles proximity similarity", "figure ground perception", "top down bottom up ' +
    'processing", "predictive coding bayesian brain", "free energy principle friston", "active ' +
    'inference perception", "signal detection theory hits", "criterion bias d prime", "two alternative ' +
    'forced choice", "psychophysics weber fechner", "stevens power law", "just noticeable difference ' +
    'jnd", "color perception trichromatic opponent", "phoneme categorical perception", "mcgurk effect ' +
    'audiovisual", "binding problem perception", "global workspace theory consciousness", "integrated ' +
    'information theory iit", "higher order thought consciousness", "neural correlate consciousness ' +
    'ncc", "blindsight residual vision", "dual process system 1 system 2", "kahneman tversky heuristics", ' +
    '"availability heuristic anchoring", "representativeness heuristic base rate", "framing effect ' +
    'prospect theory", "loss aversion endowment effect", "expected utility risk aversion", "bounded ' +
    'rationality satisficing", "drift diffusion model decision", "race accumulator model rt", "prospect ' +
    'theory s shaped", "intertemporal choice discounting", "hyperbolic discounting", "delay gratification ' +
    'marshmallow", "executive function cold hot", "inhibitory control stroop", "task switching cost", ' +
    '"flanker eriksen interference", "neurogenesis hippocampus adult", "place cells grid cells", "head ' +
    'direction cells", "default mode network dmn", "salience network insula", "frontoparietal control ' +
    'network", "cognitive load germane intrinsic", "schema script frame", "embodied cognition grounded", ' +
    '"language thought sapir whorf", "linguistic relativity", "theory of mind false belief", "mirror ' +
    'neurons macaque", "executive attention anterior cingulate") — never the literal question phrasing ' +
    'or a bare brain region/effect name alone.',
  ell:
    'If the input looks like English Language Learners SE questions (ENGLISH AS SECOND LANGUAGE / ' +
    'GRAMMAR / USAGE / IDIOMATIC ENGLISH / LEARNER-FRAMED EXPLANATIONS / ARTICLES / PREPOSITIONS / ' +
    'TENSES / PHRASAL VERBS — learner-craft framed, NOT native-speaker stylistics and NOT ' +
    'theoretical linguistics — "What is the difference between [X] and [Y]", "When do I use [tense / ' +
    'article / preposition] …", "Is [phrase] correct in English …"), distill to the english-as-L2 ' +
    'concept (e.g. "definite indefinite articles a an the", "zero article generic", "present perfect ' +
    'simple past", "present perfect continuous", "past perfect sequence", "future will going to", ' +
    '"future continuous future perfect", "modal verbs may might could", "modal verbs must have to", ' +
    '"should ought to advice", "would used to past habit", "conditional zero first second third", ' +
    '"mixed conditionals", "subjunctive were if i were", "reported speech tense backshift", "indirect ' +
    'questions word order", "question tags polarity", "subject auxiliary inversion", "phrasal verbs ' +
    'separable inseparable", "phrasal verbs transitive intransitive", "particle vs preposition", ' +
    '"prepositions of time at on in", "prepositions of place at on in", "prepositions of movement to ' +
    'into onto", "preposition stranding", "gerund infinitive complement", "stop to do stop doing", ' +
    '"remember forget regret", "verb patterns subjunctive that clause", "passive voice formation", ' +
    '"passive get vs be", "causative have get something done", "countable uncountable nouns", "much ' +
    'many little few", "some any no", "quantifiers all every each", "either neither both", "comparative ' +
    'superlative regular irregular", "as as comparison", "the more the merrier", "relative clauses ' +
    'defining non defining", "relative pronouns who whom whose which that", "reduced relative ' +
    'clauses", "participle clauses", "non finite clauses", "noun clauses that wh", "adverbial clauses", ' +
    '"subject verb agreement", "collective nouns plural", "there is there are", "it as preparatory ' +
    'subject", "cleft sentences it was", "pseudo cleft what i need", "fronting topicalization", ' +
    '"emphatic do does did", "british vs american english", "british american vocabulary differences", ' +
    '"british american grammar differences", "spelling differences color colour", "punctuation rules ' +
    'comma semicolon colon", "oxford serial comma", "apostrophe possessive contraction", "capital ' +
    'letters titles", "false friends english", "common collocations", "fixed expressions idioms", ' +
    '"polite requests would you could you", "indirect speech polite", "register formal informal", ' +
    '"academic vs conversational", "phrasal verb common make take get put") — never the literal ' +
    'question phrasing or a bare word/phrase alone.',
  economics:
    'If the input looks like Economics SE questions (ECONOMICS / MICRO / MACRO / GAME THEORY / ' +
    'PUBLIC FINANCE / MONETARY POLICY / INTERNATIONAL TRADE / LABOR / INDUSTRIAL ORG / ECONOMETRICS — ' +
    'economic-theory framed, NOT personal finance and NOT quantitative finance modeling — "Why does ' +
    '[market / policy / agent] …", "How does [model / mechanism] explain …", "What is the difference ' +
    'between [concept] and [concept]"), distill to the economics concept (e.g. "supply demand ' +
    'equilibrium", "marginal utility consumer", "marginal cost marginal revenue", "perfect competition ' +
    'monopoly", "monopolistic competition oligopoly", "cournot bertrand stackelberg", "nash ' +
    'equilibrium dominant", "prisoners dilemma cooperation", "mixed strategy nash", "subgame perfect ' +
    'equilibrium", "bayesian nash incomplete info", "mechanism design revelation", "auction theory ' +
    'first second price", "vickrey auction truth telling", "myerson optimal auction", "matching ' +
    'theory gale shapley", "principal agent moral hazard", "adverse selection lemon", "signaling ' +
    'spence labor", "screening rothschild stiglitz", "bayesian persuasion", "consumer theory utility ' +
    'maximization", "indifference curves preferences", "income substitution effect", "compensating ' +
    'equivalent variation", "revealed preference samuelson", "rational expectations lucas", "expected ' +
    'utility risk aversion", "prospect theory framing", "behavioral economics nudge", "is lm aggregate ' +
    'demand", "ad as model business cycle", "phillips curve inflation unemployment", "okun law output ' +
    'gap", "solow growth model capital", "endogenous growth romer aghion", "rbc real business cycle", ' +
    '"new keynesian dsge", "ricardian equivalence taxes", "fiscal multiplier", "monetary policy ' +
    'taylor rule", "liquidity trap zero lower bound", "money supply velocity quantity theory", "money ' +
    'demand interest rate", "balance of payments current account", "exchange rate ppp uncovered ' +
    'interest", "mundell fleming open economy", "comparative advantage ricardian", "heckscher ohlin ' +
    'factor endowment", "trade gravity model", "trade liberalization wto", "tariff non tariff barrier", ' +
    '"public goods free rider", "externalities pigouvian tax", "coase theorem property rights", ' +
    '"market failure asymmetric info", "deadweight loss tax wedge", "elasticity price income cross", ' +
    '"price discrimination first degree", "two part tariff", "natural monopoly regulation", ' +
    '"externality club good common pool", "labor supply backward bending", "minimum wage employment ' +
    'effects", "human capital becker", "search frictions diamond mortensen pissarides", "wage ' +
    'inequality skill premium", "gini coefficient lorenz", "inequality piketty", "social welfare ' +
    'arrow impossibility", "voting paradox condorcet", "median voter theorem", "rent seeking", ' +
    '"econometrics ols assumptions", "instrumental variables 2sls", "diff in diff parallel trends", ' +
    '"regression discontinuity rdd", "panel data fixed effects", "endogeneity simultaneity", ' +
    '"propensity score matching", "natural experiments labor") — never the literal question phrasing ' +
    'or a bare model/policy/economist name alone.',
  bioinformatics:
    'If the input looks like Bioinformatics SE questions (COMPUTATIONAL BIOLOGY / GENOMICS / ' +
    'TRANSCRIPTOMICS / SEQUENCE ALIGNMENT / VARIANT CALLING / NGS PIPELINES / PROTEIN STRUCTURE ' +
    'PREDICTION / PHYLOGENETICS / GENE EXPRESSION ANALYSIS / SINGLE-CELL — bioinformatics-craft ' +
    'framed, NOT pure wet-lab biology and NOT general data science — "How do I [align / call / ' +
    'assemble / annotate] …", "What is the best [tool / pipeline / format] for …", "Why is my [bam / ' +
    'fastq / vcf / gff] …"), distill to the bioinformatics concept (e.g. "sequence alignment global ' +
    'local", "needleman wunsch global", "smith waterman local", "blast heuristic alignment", "blast ' +
    'evalue bit score", "psi blast iterative", "bowtie2 short read aligner", "bwa mem long read", ' +
    '"minimap2 long read aligner", "star spliced aligner rnaseq", "hisat2 splice aware", "salmon ' +
    'pseudoalignment", "kallisto pseudoalignment quant", "fastq quality phred", "fastqc quality ' +
    'control", "trimmomatic adapter trimming", "cutadapt adapter trim", "sam bam cram format", ' +
    '"samtools sort index", "bcftools variant calling", "gatk haplotypecaller", "freebayes variant ' +
    'caller", "vcf format variant call", "vcftools manipulation", "deepvariant deep learning", ' +
    '"strelka2 small variants", "manta sv structural", "delly cnv detection", "cnvkit copy number", ' +
    '"reference genome hg19 hg38", "ensembl genome browser", "ucsc genome browser", "bedtools genomic ' +
    'intervals", "gff gtf annotation", "ncbi refseq annotation", "gencode annotation", "rna seq ' +
    'differential expression", "deseq2 negative binomial", "edger glm fit", "limma voom", "tpm fpkm ' +
    'normalization", "counts htseq featurecounts", "single cell rnaseq scrnaseq", "10x cellranger ' +
    'pipeline", "scanpy python single cell", "seurat r single cell", "umap tsne dim reduction", ' +
    '"clustering louvain leiden", "trajectory pseudotime monocle", "doublet detection scrublet", ' +
    '"batch effect correction harmony", "atac seq chromatin accessibility", "chip seq peak calling", ' +
    '"macs2 peak caller", "homer motif analysis", "bedops bed manipulation", "deeptools coverage", ' +
    '"variant annotation snpeff vep", "clinvar pathogenic interpretation", "gnomad allele frequency", ' +
    '"phylogenetic tree maximum likelihood", "raxml iqtree bayesian beast", "mrbayes phylogeny", ' +
    '"multiple sequence alignment muscle clustal mafft", "hmmer profile hmm", "pfam protein domain", ' +
    '"interproscan domain annotation", "alphafold structure prediction", "rosetta protein modeling", ' +
    '"protein blast pdb", "uniprot swissprot annotation", "go ontology enrichment", "kegg pathway ' +
    'enrichment", "reactome pathway", "gsea gene set", "snakemake workflow", "nextflow pipeline", ' +
    '"docker singularity reproducibility", "conda bioconda environment", "metagenomics 16s amplicon", ' +
    '"qiime2 microbiome", "kraken2 taxonomic classification", "metagenome assembly metaspades", ' +
    '"long read assembly canu flye", "hifiasm pacbio", "nanopore basecalling guppy", "modification ' +
    'methylation calling") — never the literal question phrasing or a bare tool/format/file alone.',
  cstheory:
    'If the input looks like Theoretical Computer Science SE questions (RESEARCH-LEVEL TCS / ' +
    'COMPLEXITY THEORY / CRYPTOGRAPHY THEORY / RANDOMIZED ALGORITHMS / CIRCUIT COMPLEXITY / DERANDOM ' +
    'IZATION / APPROXIMATION HARDNESS / QUANTUM COMPUTING / TYPE THEORY / CATEGORICAL LOGIC — ' +
    'research-craft framed, NOT undergraduate-tier algorithms and NOT applied programming — "Is ' +
    'there a known [bound / lower bound / upper bound] for …", "What is the relationship between ' +
    '[class] and [class] …", "Does [problem] admit a [PTAS / FPTAS / quasi-polynomial] …"), distill ' +
    'to the research-tcs concept (e.g. "p versus np open problem", "polynomial hierarchy collapse", ' +
    '"oracle separation baker gill solovay", "relativization barrier", "natural proofs barrier", ' +
    '"algebraic geometric pcp", "geometric complexity theory gct", "circuit lower bounds ac0 nc1 ' +
    'tc0", "shannon razborov rudich", "switching lemma hastad", "polynomial method", "communication ' +
    'complexity discrepancy", "log rank conjecture", "set disjointness lower bound", "information ' +
    'complexity protocol", "streaming algorithms p1 p2 frequency", "sketching count min", ' +
    'distinct elements hyperloglog", "submodular maximization continuous greedy", "matroid ' +
    'intersection", "lp hierarchies sherali adams lasserre", "sdp gap unique games", "unique games ' +
    'conjecture", "raghavendra sdp optimal", "small set expansion", "pcp theorem dinur", "parallel ' +
    'repetition raz", "label cover hardness", "approximation hardness gap", "fpt parameterized ' +
    'tractable", "kernelization sunflower lemma", "etb exponential time hypothesis eth", "fine grained ' +
    'complexity orthogonal vectors", "seth strong hypothesis", "matrix multiplication exponent ' +
    'omega", "coppersmith winograd laser", "tensor rank decomposition", "polynomial identity testing ' +
    'pit", "schwartz zippel lemma", "isolation lemma mulmuley", "valiant matchings vp vnp", ' +
    '"permanent determinant", "algebraic circuit complexity", "expander graphs spectral", "pseudorandom ' +
    'generators", "extractors disperse seeded", "list decoding capacity", "reed solomon code", "low ' +
    'density parity check ldpc", "polar codes arikan", "interactive proofs ip pspace", "zero ' +
    'knowledge proofs zk snark", "succinct argument sumcheck", "polynomial commitment kzg", "fhe ' +
    'fully homomorphic", "lattice based cryptography lwe", "post quantum kyber dilithium", "quantum ' +
    'algorithms shor grover", "qma bqp class", "quantum supremacy random circuit", "stabilizer ' +
    'formalism gottesman knill", "topological quantum computing", "category theory programming", ' +
    'monad comonad functor", "homotopy type theory hott", "univalence axiom", "dependent type ' +
    'theory coq lean", "linear logic proof nets", "geometry of interaction", "denotational ' +
    'semantics game", "process calculus pi calculus", "cps continuation passing", "abstract ' +
    'interpretation lattice", "model checking ltl ctl") — never the literal question phrasing or a ' +
    'bare conjecture/theorem name alone.',
  sports:
    'If the input looks like Sports SE questions (RULES OF GAMES / TRAINING SCIENCE / GAME ' +
    'STRATEGY / ATHLETE PERFORMANCE / SPORTS HISTORY / EQUIPMENT / OFFICIATING — sports-craft ' +
    'framed, NOT exercise programming and NOT general fitness — "How does [rule / scoring / ' +
    'play] work in [sport]", "Why is [technique / tactic] used in [sport]", "What is the ' +
    'difference between [position / play / formation]"), distill to the sports concept (e.g. ' +
    '"offside rule soccer", "var video assistant referee", "penalty kick spot kick", "free kick ' +
    'direct indirect", "yellow red card", "tactical formation 4 4 2", "high pressing low block", ' +
    '"counter attacking transition", "tiki taka possession", "man marking zonal", "set piece ' +
    'corner kick", "tennis grand slam serve", "tennis tiebreak rules", "topspin slice backhand", ' +
    '"basketball pick and roll", "basketball zone man defense", "three point line", "free throw ' +
    'bonus", "basketball shot clock", "rebound box out", "baseball pitching arsenal", "fastball ' +
    'slider curveball", "batting average obp slg", "ops war sabermetrics", "shift defensive ' +
    'positioning", "cricket bowling spin pace", "cricket batting order", "cricket leg before lbw", ' +
    '"duckworth lewis dls", "rugby scrum lineout", "rugby try conversion", "rugby ruck maul", ' +
    '"american football snap count", "play action route tree", "zone coverage cover 2", "running ' +
    'back rushing yards", "quarterback completion percentage", "field goal extra point", "hockey ' +
    'power play penalty kill", "icing offside hockey", "hat trick goal", "boxing southpaw ' +
    'orthodox", "jab cross hook uppercut", "mma takedown ground pound", "submission grappling", ' +
    '"weight class cutting", "marathon pacing strategy", "tempo run interval training", "heart ' +
    'rate zones", "vo2 max lactate threshold", "periodization mesocycle", "track and field ' +
    'sprint", "long jump high jump triple jump", "shot put discus javelin", "swimming freestyle ' +
    'butterfly breaststroke", "flip turn open turn", "tour de france peloton breakaway", "road ' +
    'race time trial", "cycling drafting echelon", "sprinter climber rouleur", "golf swing ' +
    'plane", "golf handicap stroke index", "approach short game putting", "f1 drs ers strategy", ' +
    '"tire compound undercut overcut", "qualifying pole position", "esports moba lane meta") — ' +
    'never the literal question phrasing or a bare team/league/player name alone.',
  aviation:
    'If the input looks like Aviation SE questions (PILOTING / AIRCRAFT SYSTEMS / FLIGHT OPS / ' +
    'AIR TRAFFIC CONTROL / NAVIGATION / METEOROLOGY FOR PILOTS / AIRWORTHINESS / ATPL CPL PPL — ' +
    'aviation-craft framed, NOT spaceflight and NOT general engineering — "Why does [aircraft / ' +
    'system / procedure] …", "What is the difference between [VFR/IFR/avionics]", "How does [ATC / ' +
    'flight rule / clearance] work …"), distill to the aviation concept (e.g. "lift drag thrust ' +
    'weight", "angle of attack stall", "stall recovery procedure", "spin recovery", "wing loading ' +
    'aspect ratio", "ground effect float", "p factor torque slipstream", "adverse yaw rudder ' +
    'coordination", "dihedral anhedral stability", "phugoid short period oscillation", "dutch ' +
    'roll yaw damper", "mach buffet coffin corner", "swept wing transonic", "flap slat high ' +
    'lift", "leading edge devices", "spoiler speedbrake", "trim tab elevator stab", "fly by wire ' +
    'envelope protection", "control law normal alternate direct", "autopilot autothrottle vnav ' +
    'lnav", "fms flight management system", "rnav rnp gps approach", "ils glideslope localizer", ' +
    '"category i ii iii minima", "circling approach minimums", "missed approach published", "go ' +
    'around procedure", "rejected takeoff v1 vr v2", "balanced field length", "weight balance cg ' +
    'envelope", "max takeoff weight mtow", "single engine ceiling", "etops twin engine", "vfr ' +
    'ifr flight rules", "class airspace b c d e g", "transponder mode s c", "tcas resolution ' +
    'advisory", "ads b in out", "atc clearance read back", "altitude restriction crossing", ' +
    '"wake turbulence separation", "icao phonetic alphabet", "satcom acars cpdlc", "metar taf ' +
    'weather report", "icing supercooled liquid", "thunderstorm avoidance", "windshear ' +
    'microburst escape", "crosswind component limit", "magnetic compass turning errors", "vor ' +
    'adf navigation", "great circle rhumb line", "polar navigation grid mode", "performance ' +
    'climb cruise descent", "step climb fuel optimization", "long range cruise lrc", "max range ' +
    'vs max endurance", "best glide speed", "engine n1 n2 egt", "turbofan turboprop ' +
    'reciprocating", "propeller blade pitch", "constant speed prop", "airworthiness directive ' +
    'ad", "service bulletin sb", "minimum equipment list mel", "logbook endorsement", "biennial ' +
    'flight review", "instrument currency", "part 121 part 135 part 91") — never the literal ' +
    'question phrasing or a bare aircraft type or airline name alone.',
  space:
    'If the input looks like Space Exploration SE questions (SPACEFLIGHT / LAUNCH VEHICLES / ' +
    'ORBITAL MECHANICS / MISSION OPERATIONS / SPACECRAFT SYSTEMS / HUMAN SPACEFLIGHT / SPACE ' +
    'AGENCIES — spaceflight-engineering framed, NOT observational astronomy and NOT general ' +
    'physics — "How does [rocket / mission / system] work …", "Why is [orbit / maneuver / stage] ' +
    'used …", "What is the difference between [launch / propulsion / mission profile]"), distill ' +
    'to the spaceflight concept (e.g. "delta v budget mission", "tsiolkovsky rocket equation", ' +
    '"specific impulse isp", "mass ratio staging", "two stage to orbit tsto", "single stage to ' +
    'orbit ssto", "hohmann transfer orbit", "bi elliptic transfer", "gravity assist flyby", ' +
    '"oberth effect powered flyby", "hyperbolic excess velocity c3", "patched conic approximation", ' +
    '"lagrange points l1 l2", "halo orbit jwst", "molniya orbit critical inclination", "sun ' +
    'synchronous orbit sso", "geostationary geosynchronous gso", "graveyard orbit", "leo meo ' +
    'geo orbit", "elliptical eccentric circular", "orbital inclination plane change", "rendezvous ' +
    'docking iss", "rdv proximity operations", "robotic arm canadarm", "extravehicular activity eva", ' +
    '"abort modes apollo shuttle", "launch escape system les", "max q dynamic pressure", "stage ' +
    'separation pyrotechnic", "fairing jettison payload", "fairing separation", "engine gimbal ' +
    'thrust vector control", "throttle deep throttle", "main engine cutoff meco", "second engine ' +
    'cutoff seco", "second stage burn", "gas generator staged combustion", "full flow staged ' +
    'combustion", "expander cycle pressure fed", "monopropellant hypergolic bipropellant", ' +
    '"hydrolox kerolox methalox", "rs 25 raptor merlin rl 10", "solid rocket booster srb", ' +
    '"hybrid rocket motor", "ion electric propulsion", "hall effect thruster", "nuclear thermal ' +
    'propulsion", "solar sail photon", "atmospheric entry heating", "ablative pica heat shield", ' +
    '"thermal protection system tps", "blunt body reentry", "skip reentry trajectory", "lifting ' +
    'reentry shuttle", "parachute drogue main", "splashdown ocean recovery", "propulsive landing ' +
    'falcon", "landing legs grid fins", "boostback entry burn", "reusability turnaround", "starlink ' +
    'constellation gps galileo", "geosync station keeping", "deorbit graveyard", "kessler syndrome ' +
    'debris", "space debris collision", "iss expedition crew rotation", "soyuz dragon starliner", ' +
    '"life support eclss", "carbon dioxide scrubber", "water recovery wpa", "space radiation ' +
    'galactic cosmic ray", "van allen belts proton", "solar particle event", "deep space network ' +
    'dsn", "telemetry tracking command ttc", "x band ka band uhf", "cubesat smallsat ride share", ' +
    '"interplanetary trajectory mars", "phase angle launch window", "delta v martian transit", ' +
    '"aerocapture aerobraking", "perseverance curiosity sample return", "europa enceladus mission") — ' +
    'never the literal question phrasing or a bare mission/rocket name alone.',
  woodworking:
    'If the input looks like Woodworking SE questions (JOINERY / FURNITURE BUILDING / HAND TOOLS / ' +
    'POWER TOOLS / WOOD SELECTION / FINISHING / SHARPENING / WORKHOLDING — woodworking-craft ' +
    'framed, NOT general DIY and NOT crafts SE textile-fiber craft — "How do I [cut / join / ' +
    'finish] …", "Why is my [joint / glue up / finish] …", "What is the difference between ' +
    '[joinery / wood / tool]"), distill to the woodworking concept (e.g. "mortise and tenon ' +
    'joint", "through wedged tenon", "loose tenon domino festool", "dovetail through half blind", ' +
    '"hand cut dovetails saw chisel", "machine cut dovetails jig", "box finger joint", "lap ' +
    'joint half lap", "bridle joint open mortise", "rabbet dado groove", "tongue and groove", ' +
    '"miter joint splined", "biscuit joint plate joiner", "pocket hole kreg", "dowel joint dowel ' +
    'jig", "edge gluing panel glue up", "cauls clamping flatness", "wood movement seasonal", ' +
    '"radial tangential longitudinal", "quartersawn flatsawn riftsawn", "kiln dried air dried ' +
    'lumber", "moisture content equilibrium emc", "domestic exotic hardwoods", "softwood ' +
    'hardwood density janka", "grain direction figure", "tearout planing reading grain", "hand ' +
    'plane tuning sole flatness", "smoothing jack jointer plane", "block plane low angle", ' +
    '"shoulder plane fitting tenon", "plough plane groove", "scrub plane stock removal", ' +
    '"chisel bench mortise paring", "japanese chisels nomi", "sharpening waterstones diamond", ' +
    '"oil stone arkansas", "honing guide bevel angle", "primary secondary bevel microbevel", ' +
    '"flatten back chisel", "scary sharp sandpaper", "saw rip crosscut tooth geometry", "tpi ppi ' +
    'pitch", "japanese pull saws ryoba dozuki", "dovetail saw kerf", "bandsaw resawing tension", ' +
    '"table saw kickback riving knife", "miter sled crosscut", "table saw blade combination", ' +
    '"router bit straight spiral compression", "router table fence", "trim router laminate", ' +
    '"jointer planer milling", "thickness planer snipe", "drum sander widebelt", "spindle ' +
    'sander oscillating", "lathe turning bowl spindle", "skew gouge parting tool", "scraper ' +
    'card scraper burnisher", "wood finishes oil shellac lacquer", "polyurethane water based ' +
    'oil based", "danish oil tung oil linseed", "shellac flake cut", "french polish", "wipe on ' +
    'poly", "wax paste finish", "stain dye pigment", "grain filler open pore", "spray finish ' +
    'hvlp", "rub out polishing", "workbench moxon vise", "leg vise tail vise face vise", ' +
    '"holdfast bench dog", "shooting board square edge", "marking knife wheel gauge", "winding ' +
    'sticks flatness") — never the literal question phrasing or a bare wood species or tool ' +
    'brand alone.',
  earthscience:
    'If the input looks like Earth Science SE questions (GEOLOGY / METEOROLOGY / OCEANOGRAPHY / ' +
    'CLIMATE SCIENCE / SEISMOLOGY / VOLCANOLOGY / HYDROLOGY / ATMOSPHERIC SCIENCE / TECTONICS — ' +
    'earth-system-science framed, NOT observational astronomy and NOT spaceflight — "Why does ' +
    '[earth phenomenon] occur", "How does [geological / atmospheric / oceanographic process] work", ' +
    '"What causes [weather / climate / earthquake / eruption]"), distill to the earth-science ' +
    'concept (e.g. "plate tectonics subduction", "mid ocean ridge spreading", "transform fault ' +
    'san andreas", "convergent divergent boundary", "hotspot mantle plume", "isostasy crust ' +
    'mantle", "moho discontinuity", "p wave s wave seismology", "richter moment magnitude", ' +
    '"earthquake focal mechanism", "tsunami runup wavelength", "volcanic explosivity index vei", ' +
    '"pyroclastic flow lahar", "magma viscosity silica", "stratovolcano shield volcano caldera", ' +
    '"basalt andesite rhyolite", "igneous sedimentary metamorphic", "rock cycle weathering", ' +
    '"radiometric dating uranium lead", "carbon dating half life", "stratigraphy law superposition", ' +
    '"unconformity bedding plane", "glaciation isostatic rebound", "milankovitch cycles", ' +
    '"el nino la nina enso", "atmospheric pressure systems", "coriolis effect rossby", "jet ' +
    'stream polar subtropical", "hadley ferrel polar cell", "trade winds westerlies", "monsoon ' +
    'circulation", "thermohaline circulation amoc", "ocean gyre boundary current", "upwelling ' +
    'downwelling", "salinity halocline thermocline", "tide spring neap", "storm surge baroclinic", ' +
    '"hurricane typhoon cyclone formation", "tropical depression saffir simpson", "tornado ' +
    'mesocyclone supercell", "fujita enhanced ef scale", "lightning charge separation", "thunderstorm ' +
    'updraft anvil", "cape cin convective", "lapse rate dry moist adiabatic", "precipitation ' +
    'orographic frontal", "dew point humidity relative", "albedo radiative balance", "greenhouse ' +
    'effect co2 methane", "climate sensitivity feedback", "ice age proxy paleoclimate", "ice core ' +
    'isotope record", "stable isotope geochemistry", "carbon cycle ocean atmosphere", "rock ' +
    'weathering silicate", "groundwater aquifer porosity", "darcy law flow", "erosion drainage ' +
    'basin", "river meander oxbow", "delta turbidite", "eolian dune barchan", "karst limestone ' +
    'cave", "permafrost thaw arctic", "soil horizon profile", "loess deposit", "mineral cleavage ' +
    'mohs hardness", "polymorph metamorphism") — never the literal question phrasing or a bare ' +
    'place name alone.',
  worldbuilding:
    'If the input looks like Worldbuilding SE questions (FICTIONAL WORLD CREATION / SETTING ' +
    'DESIGN / SPECULATIVE BIOLOGY / MAGIC SYSTEMS / FICTIONAL TECHNOLOGY / SOCIETAL DESIGN / ' +
    'GEOGRAPHY OF IMAGINED WORLDS / CULTURE BUILDING — worldbuilding-craft framed, NOT prose-craft ' +
    'fiction technique and NOT scifi canon analysis — "How would [creature / society / magic / ' +
    'technology] plausibly work in my world", "What would happen if [physics / biology / culture] ' +
    'were different", "How could I justify [setting element]"), distill to the worldbuilding ' +
    'concept (e.g. "soft hard magic system", "sandersons laws of magic", "magic cost limitation", ' +
    '"magic system rules consistency", "alien biochemistry silicon based", "speculative biology ' +
    'evolution", "convergent evolution alien", "ecology food web", "trophic cascade fictional", ' +
    '"apex predator ecosystem", "species range biome", "intelligent species sapient design", ' +
    '"alien anatomy locomotion", "alien sensory perception", "language constructed conlang", ' +
    '"naming convention culture", "kinship system clan", "cultural taboo origin", "religion ' +
    'pantheon mythology", "afterlife belief system", "writing system script", "calendar lunar ' +
    'solar fictional", "currency economy world", "trade route resource", "feudal society stratification", ' +
    '"caste class hierarchy", "succession monarchy elective", "law system fictional jurisprudence", ' +
    '"warfare strategy fictional", "siege weapon medieval", "fortification design castle", ' +
    '"naval combat fictional", "fictional army formation", "guild faction politics", "secret ' +
    'society hidden cabal", "thieves guild network", "magical item artifact", "enchantment ' +
    'ritual mechanism", "dragon physiology aerodynamics", "wing loading dragon flight", "fire ' +
    'breathing biology", "vampire weakness rules", "werewolf transformation lore", "undead ' +
    'mechanic necromancy", "fey realm rules", "elemental plane cosmology", "multiverse parallel ' +
    'world", "time travel paradox grandfather", "alternate history divergence", "post apocalypse ' +
    'survival", "dystopia societal control", "utopia plausibility", "space opera empire", "ftl ' +
    'travel jump drive", "generation ship starflight", "terraforming planet engineering", "dyson ' +
    'sphere stellar engineering", "tidally locked habitable", "ringworld habitat physics", ' +
    '"fictional climate world", "fictional geography continent", "river system drainage map", ' +
    '"fantasy map cartography", "city design medieval fantasy") — never the literal question ' +
    'phrasing or a bare character / place name alone.',
  poker:
    'If the input looks like Poker SE questions (POKER GAME THEORY / POT ODDS / EQUITY / ' +
    'GTO / RANGE CONSTRUCTION / BLUFF FREQUENCY / EXPECTED VALUE / TOURNAMENT VS CASH / ' +
    'POSITION PLAY / HAND READING — poker-craft framed, NOT general gambling and NOT ' +
    'sports betting — "How should I play [hand / spot / situation]", "What is the [pot odds / ' +
    'equity / EV] for …", "When is it correct to [bet / call / fold / raise]"), distill to the ' +
    'poker concept (e.g. "pot odds implied", "expected value ev calculation", "fold equity ' +
    'bluff", "equity realization", "minimum defense frequency mdf", "alpha bluff frequency", ' +
    '"gto game theory optimal", "exploitative play deviation", "balanced range polarized", ' +
    '"range construction preflop", "3 bet 4 bet 5 bet", "isolation raise limper", "open raise ' +
    'first in", "stealing blinds button", "squeeze play", "squeeze size sizing", "continuation ' +
    'bet cbet", "delayed cbet turn", "double barrel triple barrel", "check raise turn river", ' +
    '"polarized linear merged ranges", "bluff to value ratio", "thin value bet", "blocker ' +
    'unblocker hand", "card removal effect", "combinatorics combo counting", "pair vs unpaired ' +
    'combos", "set over set cooler", "flush draw equity", "open ended straight oesd", "gutshot ' +
    'inside straight", "wraparound draw plo", "redraw equity omaha", "rundown plo hands", ' +
    '"holdem omaha stud", "icm independent chip model", "bubble factor tournament", "satellite ' +
    'icm", "final table chop", "stack to pot ratio spr", "deep stack short stack", "tight ' +
    'aggressive tag", "loose aggressive lag", "nit fish whale", "table image dynamic", "tilt ' +
    'mental game", "bankroll management variance", "risk of ruin formula", "kelly criterion ' +
    'staking", "rakeback rake structure", "cash game rake", "tournament rake fees", "hand ' +
    'history review solver", "pio piosolver simple", "snowie monkersolver", "study off table", ' +
    '"timing tells live poker", "physical tells reads", "blocker bet river", "donk bet flop", ' +
    '"check call defend big blind", "small blind defend", "limp raise trap", "iso raise vs ' +
    'limp", "3 bet polarized linear", "4 bet bluff size", "5 bet jam shove", "shove fold hud ' +
    'nash", "push fold ranges short stack", "push fold chart 10bb", "all in equity preflop") — ' +
    'never the literal question phrasing or a bare hand notation alone.',
  cseducators:
    'If the input looks like CS Educators SE questions (CS PEDAGOGY / CURRICULUM ' +
    'DESIGN / CLASSROOM DYNAMICS / INTRODUCTORY PROGRAMMING / DATA STRUCTURES ' +
    'TEACHING / ALGORITHMS CLASSES / LAB ASSIGNMENTS / GRADING / ASSESSMENT / ' +
    'PROGRAMMING LANGUAGE CHOICE FOR TEACHING — pedagogy framed, NOT general CS ' +
    'theory and NOT software architecture and NOT math pedagogy — "How should I teach ' +
    '[concept]", "What is the best way to introduce [topic]", "How do I assess ' +
    '[skill]"), distill to the cs-pedagogy concept (e.g. "intro programming ' +
    'languages", "cs1 cs2 sequencing", "loop comprehension difficulties", "recursion ' +
    'teaching strategies", "object oriented introduction", "live coding pedagogy", ' +
    '"pair programming classroom", "automated grading testing", "plagiarism detection ' +
    'code", "block based programming scratch", "code reading comprehension", "program ' +
    'tracing exercises", "debugging instruction novice", "notional machine mental ' +
    'model", "misconceptions variable assignment", "scaffolding worked examples", ' +
    '"parsons problems puzzles", "test driven development teaching", "version control ' +
    'git classroom", "ide vs text editor learning", "flipped classroom cs", "active ' +
    'learning cs", "peer instruction cs", "rubric design programming", "auto graders ' +
    'moss", "cheating detection submission", "intro language choice python java", ' +
    '"first language pedagogical", "static vs dynamic typing teaching", "compiler ' +
    'errors message novice", "syntax error frustration", "off by one teaching", ' +
    '"recursion base case", "linked list teaching", "pointer teaching c", "memory ' +
    'model teaching", "big o pedagogy", "algorithm analysis intro", "discrete math cs ' +
    'prerequisite", "k 12 cs education", "csta standards curriculum", "ap computer ' +
    'science a", "competitive programming pedagogy", "bootcamp curriculum design", ' +
    '"abstraction laddering teaching", "concrete to abstract progression", "predict ' +
    'run investigate cycle", "use modify create progression", "cs unplugged ' +
    'activity", "computational thinking framework", "papert constructionism", "logo ' +
    'turtle pedagogy", "scratch to python transition", "snap programming ' +
    'environment", "alice 3d storytelling", "appinventor mit beginners", "processing ' +
    'creative coding", "p5 js web teaching", "trinket cloud ide", "replit classroom", ' +
    '"github classroom assignment", "jupyter notebook instruction", "colab gpu ' +
    'teaching", "starter code template", "skeleton code scaffolding", "pseudocode ' +
    'bridging concrete", "hour of code outreach", "csta level 1a 1b", "ap csp big ' +
    'idea", "data abstraction teaching", "procedural abstraction lesson", "object ' +
    'first vs object late", "imperative first vs functional first", "concept ' +
    'inventory cs1", "fcs1 first cs1 inventory", "diagnostic question multiple ' +
    'choice", "two stage exam cs", "specifications grading cs", "mastery learning ' +
    'cs", "ungrading philosophy cs", "growth mindset cs classroom") — never the ' +
    'literal question phrasing.',
  genealogy:
    'If the input looks like Genealogy & Family History SE questions (FAMILY HISTORY ' +
    'RESEARCH / ARCHIVAL SOURCES / VITAL RECORDS / CENSUS / KURRENT SCRIPT READING / ' +
    'PALEOGRAPHY / SURNAME ETYMOLOGY / DNA MATCHES / IMMIGRATION RECORDS — ' +
    'genealogy-craft framed, NOT general history and NOT biology — "What does this ' +
    'old document say", "Who was this ancestor", "Where was [name] born", "How are ' +
    'these people related"), distill to the genealogy concept (e.g. "kurrent script ' +
    'reading", "old german paleography", "sutterlin handwriting", "latin parish ' +
    'records", "census record interpretation", "vital records research", "civil ' +
    'registration europe", "ship manifest immigration", "passenger lists ellis ' +
    'island", "naturalization records", "alien registration", "dna match ' +
    'interpretation", "centimorgan shared cm", "endogamy genetic genealogy", ' +
    '"triangulation dna chromosome", "y dna haplogroup", "mitochondrial mtdna ' +
    'lineage", "ahnentafel pedigree numbering", "register system genealogy", ' +
    '"ahnentafel sosa stradonitz", "soundex surname matching", "patronymic naming ' +
    'convention", "matronymic surname", "evidence analysis genealogical proof", ' +
    '"genealogical proof standard", "primary secondary source", "fan club friends ' +
    'associates neighbors", "cluster genealogy method", "given name variants", ' +
    '"occupation old translation", "cause of death historical", "tombstone gravestone ' +
    'reading", "find a grave cemetery", "find my past british", "ancestry ' +
    'familysearch tree", "pedigree collapse", "most recent common ancestor mrca", ' +
    '"brick wall research strategy", "gedcom file format", "gedmatch comparison ' +
    'tool", "family tree dna", "my heritage matches", "23andme inheritance", ' +
    '"ancestry dna ethnicity", "autosomal dna match", "x dna inheritance", "mendelian ' +
    'segregation", "recombination crossover", "half identical region", "fully ' +
    'identical segment", "triangulation group cluster", "chromosome browser", "leeds ' +
    'method clustering", "mirror tree technique", "dna painter tool", "what are the ' +
    'odds", "segment threshold filter", "ibd vs ibs", "identical by descent", ' +
    '"identical by state", "false positive small segment", "founder effect ' +
    'community", "isolated population dna", "jewish diaspora endogamy", "acadian ' +
    'french canadian endogamy", "colonial american endogamy", "scottish clan dna", ' +
    '"irish surname patrilineal", "polish noble szlachta", "scandinavian ' +
    'patronymics", "icelandic naming", "italian commune records", "irish parish ' +
    'baptism", "french etat civil", "german kirchenbuch", "swiss familienbuch", ' +
    '"dutch doopboek", "scandinavian husforhor", "mormon ifgs index", "archive county ' +
    'historical", "wpa state archive", "social security applications ss5", "world war ' +
    'one draft", "world war two draft", "county courthouse fire", "burned counties ' +
    'records") — never the literal question phrasing or a bare ancestor name alone.',
  lifehacks:
    'If the input looks like Lifehacks SE questions (PRACTICAL EVERYDAY OPTIMIZATIONS ' +
    '/ HOUSEHOLD TIPS / TIME SAVING TRICKS / REPURPOSING COMMON ITEMS / CLEVER ' +
    'WORKAROUNDS / MINOR HOME FIXES / ORGANIZATION / PRODUCTIVITY HACKS — ' +
    'lifehacks-craft framed, NOT residential trades / electrical / plumbing and NOT ' +
    'general DIY and NOT woodworking — "How can I quickly [task]", "What is a clever ' +
    'way to [solve]", "How do I get rid of [stain / smell]", "How can I reuse [common ' +
    'item]"), distill to the lifehack concept (e.g. "stain removal techniques", ' +
    '"fabric care tips", "wrinkle removal cloth", "kitchen organization tricks", ' +
    '"drawer divider hack", "food storage longevity", "leftover food preservation", ' +
    '"bottle hack repurpose", "rubber band uses", "duct tape applications", "magnet ' +
    'uses household", "static electricity hair", "knot tying utility", "shoelace ' +
    'lacing patterns", "bag packing folding", "kondo folding clothes", "marie kondo ' +
    'method", "label printing organize", "qr code labels", "cable management hack", ' +
    '"tangle free cables", "earbud cable storage", "phone holder diy", "cardboard ' +
    'repurpose", "egg carton reuse", "toothbrush cleaning hack", "shower curtain ' +
    'cleaning", "dryer sheet uses", "baking soda cleaning", "vinegar uses cleaning", ' +
    '"lemon peel uses", "coffee grounds reuse", "olive oil uses non culinary", "wd40 ' +
    'alternatives", "frozen lemon zest", "freezer hack ice", "ice cube herbs", "tea ' +
    'bag reuse", "shoe polish quick", "leather restore", "scratch repair wood quick", ' +
    '"fabric softener static", "tennis ball dryer", "shower head cleaning vinegar", ' +
    '"drain unclog baking soda", "garbage disposal smell lemon", "mattress ' +
    'freshener", "carpet cleaning club soda", "pillow yellowing whitening", ' +
    '"microwave steam clean lemon", "iron cleaning salt", "burnt pan baking soda", ' +
    '"cast iron seasoning", "scratched dvd toothpaste", "sticker residue oil", ' +
    '"permanent marker rubbing alcohol", "ink stain hairspray", "blood stain cold ' +
    'water", "red wine stain salt", "gum freezer ice", "wax candle freezer scrape", ' +
    '"pet hair rubber glove", "dust microfiber cloth", "ceiling fan pillowcase dust", ' +
    '"blinds sock vinegar", "window squeegee technique", "shower glass squeegee", ' +
    '"limescale citric acid", "kettle descale vinegar", "humidifier vinegar clean", ' +
    '"dishwasher rinse aid hack", "coffee maker descale", "garbage bag quick liner", ' +
    '"trash can odor baking soda", "fridge odor activated charcoal", "freezer ' +
    'organization bins", "pantry decanter labels", "spice jar magnet board", "fitted ' +
    'sheet folding", "suitcase rolling clothes", "vacuum bag clothes storage", "shoe ' +
    'storage door", "drawer dividers cardboard") — never the literal question ' +
    'phrasing.',
  opensource:
    'If the input looks like Open Source SE questions (OPEN-SOURCE LICENSING / ' +
    'GOVERNANCE / COMMUNITY MANAGEMENT / CONTRIBUTOR LICENSE AGREEMENTS / COPYLEFT ' +
    'VS PERMISSIVE / COMPATIBILITY BETWEEN LICENSES / TRADEMARK POLICY / FORKING ' +
    'ETIQUETTE / RELICENSING — open-source-governance framed, NOT general software ' +
    'architecture and NOT github trending "What license should I use", "Can I ' +
    'combine GPL with [other]", "How does CLA work", "Is this license compatible ' +
    'with that"), distill to the open-source-governance concept (e.g. "gpl vs mit ' +
    'license", "copyleft vs permissive", "agpl network clause", "license ' +
    'compatibility matrix", "lgpl static linking", "mpl mozilla file scope", "apache ' +
    'patent grant", "bsd license clauses", "isc license simplicity", "creative ' +
    'commons software", "contributor license agreement cla", "developer certificate ' +
    'of origin dco", "copyright assignment policy", "relicensing project", "license ' +
    'headers files", "spdx identifier license", "license expression", "license ' +
    'incompatibility gpl bsd", "trademark policy open source", "name and logo ' +
    'policy", "code of conduct community", "governance model project", "benevolent ' +
    'dictator bdfl", "consensus governance project", "foundation owned project", ' +
    '"asf apache foundation governance", "linux foundation governance", "fork ' +
    'etiquette upstream", "downstream maintenance fork", "rebrand fork hostile", ' +
    '"fair source license", "source available license", "business source license ' +
    'bsl", "non commercial license", "ethical source license", "license compliance ' +
    'distribution", "redistribution binary obligations", "dynamic linking license ' +
    'obligations", "static linking gpl boundary", "contributor copyright retention", ' +
    '"ip clearance project", "patent grant clause", "defensive patent license", ' +
    '"patent retaliation clause", "warranty disclaimer license", "license ' +
    'proliferation osi", "osi approved license", "free software foundation fsf", ' +
    '"copyleft strong weak", "permissive license adoption", "dual licensing ' +
    'strategy", "commercial open source", "open core model", "elastic license sspl", ' +
    '"redis sspl rsalv2", "license stewardship oss", "semver breaking changes", "rfc ' +
    'process consensus", "decision log adr", "good first issue label", "stale bot ' +
    'policy", "issue template project", "pr template checklist", "merge strategy ' +
    'squash rebase", "branch protection main", "signed commits dco gpg", "release ' +
    'notes generator", "changelog keep a changelog", "contributor guidelines docs", ' +
    '"sponsorship github sponsors", "open collective fiscal host", "tidelift ' +
    'maintainer pay", "license scan fossology", "sbom cyclonedx spdx", "sbom ' +
    'generator syft", "license header preamble", "reuse spec compliance", "scancode ' +
    'toolkit", "spdx license list updates", "binary distribution license", "embed ' +
    'license in app") — never the literal question phrasing or a bare license SPDX ' +
    'id alone.',
  martialarts:
    'If the input looks like Martial Arts SE questions (TECHNIQUE / TRAINING METHODOLOGY / ' +
    'LINEAGE AND HISTORY / WEAPONS FORMS / KATA / SPARRING / GRAPPLING / STRIKING / STANCES / ' +
    'BREATHING / CONDITIONING / BELT RANKING / DOJO ETIQUETTE — martial-arts-craft framed, ' +
    'NOT general fitness programming and NOT sports rules and NOT combat sports betting — ' +
    '"How do I throw a [technique]", "What is the difference between [style A] and [style B]", ' +
    '"How is [kata / form] performed", "What is the lineage of [school]"), distill to the ' +
    'martial-arts concept (e.g. "bjj guard pass", "armbar mechanics", "rear naked choke", ' +
    '"triangle choke setup", "kimura shoulder lock", "guillotine choke", "muay thai clinch", ' +
    '"teep front kick", "roundhouse kick mechanics", "spinning back kick", "boxing jab cross", ' +
    '"slipping rolling boxing", "footwork pivot boxing", "karate kihon basics", "shotokan ' +
    'kata heian", "kyokushin knockdown", "goju ryu sanchin", "wing chun centerline", "chi ' +
    'sao trapping", "tai chi push hands", "taekwondo poomsae form", "olympic taekwondo ' +
    'scoring", "judo throw uchi mata", "osoto gari throw", "ippon seoi nage", "harai goshi ' +
    'mechanics", "ukemi breakfall", "judo gripping fighting", "aikido irimi tenkan", "kokyu ' +
    'breath power", "iaido katana draw", "kendo shinai cuts", "kenjutsu sword forms", "kobudo ' +
    'weapons", "bo staff spinning", "nunchaku flow", "sai blocking", "tonfa retention", "krav ' +
    'maga combatives", "systema breathing", "filipino kali sticks", "escrima single stick", ' +
    '"capoeira ginga", "capoeira au cartwheel", "silat sweeping", "savate kicking", "sambo ' +
    'leg locks", "catch wrestling rides", "freestyle wrestling shot", "greco roman pummel", ' +
    '"sanda chinese boxing", "lethwei headbutts", "mma ground and pound", "guard retention ' +
    'jiu jitsu", "lapel guard worm", "deep half guard", "butterfly guard sweep", "x guard ' +
    'sweep", "leg lock heel hook", "kimura trap system", "ezekiel choke", "cross collar choke", ' +
    '"belt promotion criteria", "shu ha ri progression", "kihon kumite kata bunkai", ' +
    '"breaking boards tameshiwari", "ki kokyu energy") — never the literal question phrasing ' +
    'or a bare technique-name romaji alone.',
  freelancing:
    'If the input looks like Freelancing SE questions (CONTRACT NEGOTIATION / ' +
    'PRICING / SCOPE MANAGEMENT / CLIENT RELATIONSHIPS / INVOICING / CHASING PAYMENT ' +
    '/ TAX HANDLING / DELIVERABLES / NDA / IP OWNERSHIP / SUBCONTRACTING / SCOPE ' +
    'CREEP — freelance-business framed, NOT general workplace employee dynamics and ' +
    'NOT general money personal finance and NOT legal corporate filings — "How do I ' +
    'price [project]", "How do I handle [scope creep]", "What goes in a [contract ' +
    'clause]", "How do I chase [unpaid invoice]"), distill to the freelance-business ' +
    'concept (e.g. "fixed price vs hourly", "value based pricing", "day rate ' +
    'calculation", "hourly rate freelance", "retainer agreement model", "monthly ' +
    'retainer scope", "scope creep prevention", "change order request", "project ' +
    'kickoff brief", "statement of work sow", "milestone payments structure", ' +
    '"deposit upfront percentage", "kill fee clause", "termination for convenience", ' +
    '"non disclosure agreement nda", "mutual nda freelance", "intellectual property ' +
    'assignment", "work for hire clause", "background ip carve out", "license back ' +
    'to freelancer", "indemnification clause limit", "liability cap freelance", ' +
    '"chasing late payment", "demand letter invoice", "small claims unpaid", ' +
    '"factoring invoices freelance", "international payment wise", "currency ' +
    'conversion freelance", "1099 vs w2 contractor", "self employment tax", ' +
    '"estimated quarterly tax", "vat reverse charge", "ir35 contractor uk", ' +
    '"umbrella company uk", "limited company freelance uk", "single member llc tax", ' +
    '"schedule c expenses", "home office deduction", "client testimonial request", ' +
    '"case study client approval", "portfolio nda safe", "subcontracting freelance ' +
    'work", "white label subcontract", "agency middleman markup", "client onboarding ' +
    'questionnaire", "discovery call sales", "proposal template freelance", "pricing ' +
    'tiers proposal", "contract review red flags", "non compete enforceability ' +
    'freelance", "non solicitation clause", "exclusivity clause freelance", "rate ' +
    'increase letter", "annual rate review", "feast or famine cashflow", "emergency ' +
    'fund freelancer", "income smoothing tax", "discovery call agenda template", ' +
    '"needs analysis questionnaire", "proposal close ratio", "anchor pricing ' +
    'psychology", "pricing matrix bronze silver", "bundling unbundling pricing", ' +
    '"premium positioning niche", "horizontal vs vertical specialist", "thought ' +
    'leadership freelance", "lead magnet funnel", "newsletter list freelance", ' +
    '"linkedin outreach personalization", "cold email template", "warm intro ' +
    'request", "case study format problem", "social proof testimonial collection", ' +
    '"fiverr upwork pros cons", "contra freelance platform", "toptal vetting ' +
    'experience", "deel remote contractor", "honeybook dubsado crm", "bonsai ' +
    'contract templates", "freshbooks vs harvest", "novo freelance bank") — never ' +
    'the literal question phrasing.',
  spanish:
    'If the input looks like Spanish Language SE questions (SPANISH GRAMMAR / VOCABULARY / ' +
    'CONJUGATION / IDIOM / DIALECTAL VARIATION / PRONUNCIATION / ETYMOLOGY / TRANSLATION / ' +
    'USAGE — Spanish-language-craft framed, NOT general linguistics theory and NOT japanese / ' +
    'italian / russian L2 lanes — "How is [verb] conjugated in [tense]", "What is the ' +
    'difference between [ser and estar]", "When do I use [subjunctive]", "What does [Spanish ' +
    'phrase] mean"), distill to the Spanish-language concept (e.g. "ser vs estar", "preterite ' +
    'vs imperfect", "subjunctive mood spanish", "imperative tu vs usted", "future tense ' +
    'conjugation", "conditional tense spanish", "present perfect spanish", "pluperfect ' +
    'spanish", "por vs para", "hacer time expressions", "tener idioms", "personal a", "direct ' +
    'object pronoun", "indirect object pronoun", "double object pronoun spanish", "leismo ' +
    'loismo laismo", "voseo argentine", "vosotros vs ustedes", "rioplatense spanish", ' +
    '"castilian distinción", "seseo ceceo", "yeismo pronunciation", "rolled r alveolar trill", ' +
    '"silent h spanish", "stressed vowel rules", "diphthong hiatus spanish", "accent mark ' +
    'tilde rules", "diaeresis güe gui", "diminutive suffix ito", "augmentative suffix ón", ' +
    '"reflexive verb spanish", "reciprocal se construction", "passive se impersonal", ' +
    '"gustar verb structure", "verbs like gustar", "ojalá subjunctive", "como si imperfect ' +
    'subjunctive", "if clause si conditional", "future of probability", "conditional of ' +
    'probability", "estar with past participle", "haber there is", "hay vs está", "muy vs ' +
    'mucho", "qué vs cuál", "porque porqué por qué", "pero sino sino que", "aunque + ' +
    'subjunctive", "cuando + subjunctive future", "noun gender exceptions spanish", "el agua ' +
    'feminine", "false cognates spanish", "embarazada actual carpeta", "ll pronunciation ' +
    'sheismo", "vocabulary regional differences", "mexicanism españolismo", "argentinism ' +
    'lunfardo", "rae dictionary norm", "spanish punctuation inverted", "RAE vs uso real") — ' +
    'never the literal question phrasing.',
  homebrew:
    'If the input looks like Homebrewing SE questions (BEER / MEAD / CIDER / WINE / ' +
    'KOMBUCHA / YEAST PROPAGATION / FERMENTATION / MASHING / SPARGING / HOPPING / ' +
    'CARBONATION / RECIPE FORMULATION / WATER CHEMISTRY / OFF FLAVOR DIAGNOSIS — ' +
    'homebrewing-craft framed, NOT commercial brewing engineering and NOT specialty ' +
    'coffee Wed-06 and NOT general cooking — "How do I [brew style]", "Why is my ' +
    '[ferment] doing [thing]", "What temperature for [yeast strain]", "How do I ' +
    'clear [haze]"), distill to the homebrewing concept (e.g. "all grain mashing", ' +
    '"biab brew in a bag", "single infusion mash", "step mash protein rest", ' +
    '"decoction mash german", "mash ph adjustment", "sparge water temperature", "fly ' +
    'sparge vs batch", "first wort hopping", "hop schedule ibu", "whirlpool hop ' +
    'addition", "dry hopping schedule", "biotransformation hops", "yeast pitch ' +
    'rate", "yeast starter stir plate", "yeast harvest top crop", "yeast washing ' +
    'repitching", "fermentation temperature control", "diacetyl rest lager", ' +
    '"acetaldehyde green beer", "fusel alcohol hot", "ester banana phenolic", "dms ' +
    'corn off flavor", "autolysis yeast off", "oxidation cardboard staling", ' +
    '"krausen blowoff tube", "secondary fermentation transfer", "cold crash gelatin ' +
    'fining", "isinglass biofine clarity", "force carbonation kegerator", "priming ' +
    'sugar bottle conditioning", "co2 volumes carbonation chart", "bottle bombs over ' +
    'priming", "water chemistry brunwater", "calcium chloride sulfate balance", ' +
    '"burton on trent water", "pilsner soft water profile", "campden tablet ' +
    'chloramine", "lactic acid mash ph", "phosphoric acid brewing", "starsan no ' +
    'rinse sanitizer", "pbw cleaner caustic", "iodophor sanitizer dose", "wort ' +
    'chiller immersion plate", "no chill cube method", "mead must honey gravity", ' +
    '"staggered nutrient addition", "tosna nutrient protocol", "kveik norwegian ' +
    'farmhouse", "brett brettanomyces secondary", "lambic spontaneous fermentation", ' +
    '"sour beer kettle souring", "lacto pediococcus souring", "hard cider apple ' +
    'varieties", "kombucha scoby second ferment", "milk kefir grains", "all grain ' +
    'efficiency calculation", "extract twang flavor", "partial mash bag", "no sparge ' +
    'brew method", "modified malt diastatic", "specialty grain steeping", "crystal ' +
    'caramel malt range", "munich vienna malt", "victory biscuit malt", "smoke malt ' +
    'rauchbier", "acid malt sauermalz", "proteolytic protein rest", "ferulic acid ' +
    'rest", "mash thickness ratio", "rims herms electric brewery", "kettle gravity ' +
    'preboil", "spunding valve carbonation", "pressure fermentation lager", "cold ' +
    'side oxygen pickup", "lodo low oxygen brewing", "berliner weisse kettle sour", ' +
    '"gose salt coriander", "sour mash bourbon influence", "jun honey green tea", ' +
    '"tibicos water kefir grains") — never the literal question phrasing.',
  sound:
    'If the input looks like Sound Design SE questions (AUDIO ENGINEERING / RECORDING / ' +
    'MIXING / MASTERING / SIGNAL PROCESSING / MICROPHONE TECHNIQUE / ROOM ACOUSTICS / FIELD ' +
    'RECORDING / FOLEY / SOUND DESIGN — audio-engineering-craft framed, NOT music theory ' +
    'Mon-11 and NOT dsp Mon-10 signal-math and NOT music production marketing — "How do I ' +
    'mix [instrument]", "What microphone for [source]", "How do I treat [room]", "Why does ' +
    'my mix [problem]"), distill to the audio-engineering concept (e.g. "parallel ' +
    'compression mix bus", "sidechain compression ducking", "multiband compression mastering", ' +
    '"mid side eq stereo", "linear phase eq mastering", "minimum phase eq mixing", "subtractive ' +
    'eq cut", "dynamic eq de essing", "gain staging mix", "lufs loudness target", "true peak ' +
    'limiter intersample", "k weighting loudness", "headroom mastering chain", "reference ' +
    'track mixing", "dither truncation noise", "sample rate conversion artifacts", "aliasing ' +
    'oversampling plugin", "convolution reverb impulse response", "early reflections decay ' +
    'time", "rt60 reverberation room", "first reflection point treatment", "bass trap corner ' +
    'absorption", "diffusion vs absorption", "room mode standing wave", "schroeder frequency ' +
    'small room", "near field monitor placement", "isosceles triangle monitoring", "stereo ' +
    'imaging haas effect", "blumlein pair stereo", "decca tree orchestra", "spaced pair ab ' +
    'recording", "ortf coincident pair", "xy stereo mic", "ms mid side recording", "shotgun ' +
    'mic dialogue", "lavalier mic placement", "boom mic placement", "phantom power 48v ' +
    'condenser", "ribbon mic figure 8", "dynamic mic plosives", "pop filter sibilance", ' +
    '"acoustic guitar sm57", "kick drum d112", "snare top bottom mic", "overhead drum ' +
    'recorderman", "room mic compression", "reamping di guitar", "amp simulator ir cabinet", ' +
    '"vocal de essing sibilance", "tape saturation harmonics", "soft clipping vs hard", ' +
    '"transient designer drums", "noise gate threshold", "expander downward dynamics", ' +
    '"foley footstep recording", "field recorder zoom h6", "wind protection blimp", "boom ' +
    'pole shockmount", "post production dialogue editing", "adr looping vocals") — never ' +
    'the literal question phrasing.',
  '3dprinting':
    'If the input looks like 3D Printing SE questions (FDM / SLA / RESIN / FILAMENT / NOZZLE ' +
    'CALIBRATION / SLICER SETTINGS / BED LEVELING / RETRACTION / EXTRUSION / SUPPORTS / ' +
    'ADHESION / WARPING / LAYER ADHESION — additive-manufacturing-craft framed, NOT general ' +
    'mechanical engineering Thu-22 and NOT electronics EE Mon-22 and NOT woodworking Fri-13 ' +
    '— "Why is my print [defect]", "What temperature for [filament]", "How do I level [bed]", ' +
    '"What slicer settings for [material]"), distill to the 3D-printing concept (e.g. "fdm ' +
    'fused deposition modeling", "sla stereolithography resin", "msla mono lcd printer", ' +
    '"dlp digital light processing", "sls selective laser sintering", "pla filament ' +
    'temperature", "petg layer adhesion", "abs warping enclosure", "asa uv resistant", "tpu ' +
    'flexible filament", "nylon hygroscopic drying", "polycarbonate high temp", "carbon ' +
    'fiber filled abrasive", "wood filled pla", "filament drying box", "moisture absorption ' +
    'filament", "first layer height calibration", "live z offset bltouch", "bed leveling ' +
    'mesh", "auto bed leveling probe", "bltouch crtouch sensor", "manual bed tramming", ' +
    '"pei powder coated bed", "garolite g10 nylon", "glass bed adhesion glue stick", "build ' +
    'plate magnetic flexible", "first layer squish", "elephant foot first layer", "brim ' +
    'skirt raft adhesion", "supports tree organic", "support overhang angle", "bridging ' +
    'unsupported span", "retraction distance bowden", "retraction speed direct drive", ' +
    '"stringing oozing temperature", "linear advance pressure", "input shaping resonance", ' +
    '"klipper firmware accel", "marlin firmware config", "octoprint plugin", "cura prusaslicer ' +
    'orca", "infill pattern gyroid", "wall line count", "perimeter shell thickness", "top ' +
    'bottom layer count", "ironing top surface", "fuzzy skin texture", "vase mode spiralize", ' +
    '"e step calibration extruder", "flow rate extrusion multiplier", "horizontal expansion ' +
    'compensation", "xy size compensation cura", "nozzle hardened steel abrasive", "nozzle ' +
    'diameter line width", "volcano hotend high flow", "all metal hotend ptfe", "core xy ' +
    'voron", "delta kinematics calibration", "resin print supports", "resin exposure time ' +
    'test", "resin wash and cure", "resin lcd screen replacement", "fep film vat", "post ' +
    'processing acetone vapor", "annealing pla petg", "layer line smoothing", "bed adhesion ' +
    'failure", "spaghetti print runaway") — never the literal question phrasing.',
  scicomp:
    'If the input looks like Computational Science SE questions (NUMERICAL METHODS / HPC / ' +
    'PARALLEL COMPUTING / PDE SOLVERS / FINITE ELEMENT / FINITE DIFFERENCE / SPARSE LINEAR ' +
    'SOLVERS / OPTIMIZATION / MONTE CARLO / SCIENTIFIC SOFTWARE — scientific-computing-craft ' +
    'framed, NOT applied ML datascience Mon-02 and NOT signal-math dsp Mon-10 and NOT pure ' +
    'math 09 default and NOT financial quant Mon-04 — "How do I solve [PDE]", "Why does my ' +
    '[solver] [diverge]", "What method for [problem]", "How do I parallelize [kernel]"), ' +
    'distill to the scientific-computing concept (e.g. "finite element method", "finite ' +
    'difference scheme", "spectral method pde", "discontinuous galerkin", "weak formulation ' +
    'pde", "boundary conditions dirichlet neumann", "implicit time stepping", "explicit time ' +
    'integration", "runge kutta order", "stability cfl condition", "von neumann analysis", ' +
    '"stiff ode bdf", "adaptive mesh refinement", "amr octree mesh", "multigrid solver", ' +
    '"krylov subspace methods", "conjugate gradient cg", "gmres minres", "preconditioner ' +
    'ilu", "amg algebraic multigrid", "domain decomposition", "schwarz method overlap", ' +
    '"sparse matrix csr coo", "matrix free operator", "mpi message passing", "openmp shared ' +
    'memory", "cuda gpu kernel", "kokkos performance portability", "petsc trilinos library", ' +
    '"fenics firedrake fem", "numpy scipy numerical", "julia performance loop", "fortran ' +
    'modern array", "monte carlo integration", "metropolis hastings sampling", "quasi monte ' +
    'carlo", "uncertainty quantification pce", "polynomial chaos expansion", "kriging ' +
    'gaussian process", "rom reduced order model", "pod proper orthogonal", "fft pseudo ' +
    'spectral", "navier stokes solver", "incompressible flow projection", "compressible cfd ' +
    'godunov", "high resolution weno", "shock capturing flux limiter", "particle in cell ' +
    'pic", "smoothed particle hydrodynamics", "lattice boltzmann lbm", "molecular dynamics ' +
    'integrator", "verlet leapfrog symplectic", "energy conservation drift", "iterative ' +
    'eigensolver lanczos", "arnoldi shift invert", "newton raphson nonlinear", "line search ' +
    'trust region", "automatic differentiation forward", "reverse mode adjoint pde", ' +
    '"checkpointing memory time", "scaling weak strong", "performance roofline model") — ' +
    'never the literal question phrasing.',
  gaming:
    'If the input looks like Arqade/Gaming SE questions (VIDEO GAME MECHANICS / LORE / ' +
    'STRATEGY / SPEEDRUNNING / GLITCHES / MODS / PATCHES / ACHIEVEMENTS / WALKTHROUGH / ' +
    'BUILD GUIDES — video-game-craft framed, NOT board games boardgames Sat-13 and NOT chess ' +
    'Sat-12 and NOT TTRPG rpg Sat-21 and NOT anime canon Sun-13 and NOT cinema craft movies ' +
    'Sat-18 — "How do I beat [boss]", "Where is [item] in [game]", "What is the best ' +
    '[build]", "How do I unlock [achievement]"), distill to the video-game concept (e.g. ' +
    '"speedrun any percent", "speedrun 100 percent", "tas tool assisted", "frame perfect ' +
    'input", "wrong warp glitch", "out of bounds clip", "save state cheat detection", "rng ' +
    'manipulation", "input lag latency", "tickrate netcode rollback", "delay based netcode", ' +
    '"matchmaking elo mmr", "smurf account rank", "meta tier list", "patch notes balance", ' +
    '"buff nerf rework", "build optimization theorycraft", "min maxing stats", "skill tree ' +
    'respec", "loot table drop rate", "rng seed manipulation", "boss mechanics phase", ' +
    '"enrage timer raid", "dps rotation parse", "tank threat aggro", "healer triage mana", ' +
    '"cc crowd control", "hard counter pick", "team composition synergy", "lane minion ' +
    'wave", "jungle camp timing", "objective dragon baron", "siege push split", "farming ' +
    'gold experience", "level up curve", "endgame gear progression", "raid mechanics ' +
    'savage", "mythic plus dungeon", "challenge mode timer", "souls like parry", "stagger ' +
    'poise breakpoint", "iframe dodge roll", "stamina management combat", "bloodborne rally ' +
    'health", "elden ring spirit ash", "dark souls covenant", "stealth detection cone", ' +
    '"alert state suspicion", "ai pathing exploit", "hitbox hurtbox frame data", "cancel ' +
    'chain combo", "frame trap mixup", "motion input dragon punch", "input buffer leniency", ' +
    '"neutral game footsie", "corner pressure mixup", "okizeme wakeup", "shoryuken anti ' +
    'air", "fireball zoning", "anti zone teleport", "command grab tick throw", "armor super ' +
    'armor frames", "ggpo netplay rollback", "controller mod modder", "speedrun com ' +
    'leaderboard", "console emulator accuracy") — never the literal question phrasing.',
  reverseengineering:
    'If the input looks like Reverse Engineering SE questions (BINARY RE / DISASSEMBLY / ' +
    'FIRMWARE / MALWARE ANALYSIS / IDA / GHIDRA / CRACKMES / SHELLCODE / OBFUSCATION / ' +
    'PACKERS / EMULATION — binary-RE-craft framed, NOT web/appsec security 07 default and ' +
    'NOT signal-math dsp Mon-10 and NOT electronics EE Mon-22 and NOT software engineering ' +
    'Wed-17 — "How do I reverse [binary]", "What does this [opcode] do", "How do I unpack ' +
    '[packer]", "Why does [malware] [behavior]"), distill to the binary-RE concept (e.g. ' +
    '"static analysis disassembly", "dynamic analysis sandbox", "ida pro signature flirt", ' +
    '"ghidra decompiler script", "binary ninja bn", "radare2 r2 cutter", "x64dbg windbg ' +
    'debugger", "gdb pwndbg gef", "frida runtime instrumentation", "qiling cross arch ' +
    'emulator", "unicorn engine emulation", "capstone disassembler library", "keystone ' +
    'assembler", "calling convention cdecl stdcall", "fastcall x64 abi", "stack frame ' +
    'prologue", "function epilogue ret", "control flow graph cfg", "data flow analysis", ' +
    '"symbolic execution angr", "concolic execution z3", "taint tracking malware", "anti ' +
    'debug ptrace", "anti vm vmware detection", "anti sandbox cuckoo", "tls callback anti ' +
    'debug", "iat import address table", "eat export address", "pe header parser", "elf ' +
    'section header", "macho load command", "pdb symbols server", "dwarf debug info", "code ' +
    'obfuscation control flow", "opaque predicate dead code", "string encryption stack", ' +
    '"import hashing imphash", "yara rule signature", "polymorphic engine packer", ' +
    '"metamorphic mutation malware", "upx unpacker manual", "themida vmprotect virtualizer", ' +
    '"bytecode vm devirt", "shellcode position independent", "egg hunter shellcode", "rop ' +
    'chain gadget", "heap spray shellcode", "format string vuln", "use after free uaf", ' +
    '"type confusion vtable", "double free heap", "rop gadgets ropper", "one gadget magic", ' +
    '"got plt overwrite", "fini ctors hijack", "library function fingerprinting", "flirt ' +
    'sigmake", "kernel rootkit driver", "bootkit mbr uefi", "fileless powershell malware", ' +
    '"macro doc dropper", "lolbin living off land", "c2 traffic analysis", "firmware ' +
    'extraction binwalk", "uefi spi flash dump") — never the literal question phrasing.',
  literature:
    'If the input looks like Literature SE questions (LITERARY CRITICISM / CANON ANALYSIS / ' +
    'PERIOD LITERATURE / LITERARY DEVICES / LITERARY THEORY / AUTHORIAL INTENT / NARRATIVE ' +
    'STRUCTURE / CHARACTER ANALYSIS / SYMBOLISM / GENRE STUDY — literary-criticism-craft ' +
    'framed, NOT writing craft writers Sun-21 and NOT biblical exegesis hermeneutics Sun-20 ' +
    'and NOT mythology Sun-06 and NOT scifi craft Sun-05 — "What does [symbol] mean in ' +
    '[book]", "Why does [character] [act]", "What is the theme of [work]", "How does ' +
    '[author] use [device]"), distill to the literary-criticism concept (e.g. "new criticism ' +
    'close reading", "structuralism narrative", "post structuralism deconstruction", ' +
    '"russian formalism shklovsky", "reader response theory", "feminist literary criticism", ' +
    '"postcolonial theory said", "marxist literary theory", "psychoanalytic criticism freud", ' +
    '"jungian archetype criticism", "new historicism greenblatt", "cultural materialism ' +
    'williams", "queer theory literature", "ecocriticism nature writing", "narratology ' +
    'genette", "focalization point of view", "free indirect discourse", "stream of ' +
    'consciousness joyce", "unreliable narrator booth", "implied author wayne", "diegesis ' +
    'mimesis aristotle", "in medias res", "frame narrative chaucer", "epistolary novel ' +
    'form", "bildungsroman coming age", "kunstlerroman artist novel", "picaresque rogue ' +
    'tale", "satire menippean horatian", "irony dramatic verbal", "metaphor vehicle tenor", ' +
    '"synecdoche metonymy", "chiasmus rhetorical", "anaphora epistrophe repetition", "iambic ' +
    'pentameter blank verse", "heroic couplet pope", "sonnet petrarchan shakespearean", ' +
    '"villanelle terza rima", "free verse modernist", "imagism pound hd", "epic simile ' +
    'homeric", "deus ex machina euripides", "anagnorisis peripeteia", "catharsis tragedy ' +
    'aristotle", "tragic flaw hamartia", "comic relief shakespeare", "pastoral elegy ' +
    'lycidas", "ode keats shelley", "metaphysical conceit donne", "kenning anglo saxon", ' +
    '"alliteration assonance consonance", "iambic tetrameter ballad", "dactyl trochee ' +
    'meter", "spondee pyrrhic", "intertextuality kristeva", "death of the author barthes", ' +
    '"anxiety of influence bloom", "great tradition leavis", "literary canon bloom", ' +
    '"modernism eliot pound", "postmodern pastiche jameson") — never the literal question ' +
    'phrasing.',
  apple:
    'If the input looks like Ask Different (Apple) SE questions (MACOS / IOS / IPADOS / ' +
    'WATCHOS / TVOS / APPLE HARDWARE / FINDER / SAFARI / ICLOUD / APPLE ID / TIME MACHINE / ' +
    'APP STORE / HOMEKIT — apple-power-user-craft framed, NOT general consumer computing ' +
    'superuser default and NOT linux-desktop askubuntu Thu-06 default and NOT pro sysadmin ' +
    'serverfault hour-16 — "How do I [setting] on macOS", "Why does my [iPhone] [behavior]", ' +
    '"How do I migrate to [new mac]", "What does [console message] mean"), distill to the ' +
    'apple-platform concept (e.g. "macos system preferences", "macos terminal zsh", "macos ' +
    'finder column view", "spotlight indexing reset", "mds_stores cpu high", "kernel task ' +
    'cpu", "macos activity monitor", "macos disk utility apfs", "apfs container volume", ' +
    '"hfs plus journaled", "fusion drive split", "core storage logical", "filevault ' +
    'encryption recovery", "t2 chip secure boot", "apple silicon m series", "rosetta 2 ' +
    'translation", "universal binary arm x86", "macos recovery internet", "dfu mode restore", ' +
    '"apple configurator 2", "macos installer createinstallmedia", "system integrity ' +
    'protection sip", "gatekeeper notarization", "xprotect malware definitions", "apple ' +
    'silicon bootloader iboot", "smc reset nvram pram", "icloud drive sync", "icloud ' +
    'keychain sync", "apple id two factor", "find my activation lock", "time machine ' +
    'snapshot apfs", "tmutil exclude path", "homebrew package manager", "macports darwin ' +
    'ports", "xcode command line tools", "swift toolchain", "objective c bridging", "applet ' +
    'automator workflow", "shortcuts app automation", "applescript osascript", "launchd ' +
    'launchctl plist", "launchagents launchdaemons", "system extension kext deprecation", ' +
    '"endpoint security framework", "transparency consent control tcc", "screen recording ' +
    'permission", "accessibility permission", "full disk access", "microphone permission ' +
    'macos", "ios sideloading altstore", "ios developer mode", "iphone backup encryption", ' +
    '"itunes finder backup", "ipados stage manager", "ios shortcut automation", "homekit ' +
    'matter accessory", "airplay 2 receiver", "handoff continuity camera", "universal ' +
    'control mac ipad", "sidecar ipad display", "airdrop firewall block", "icloud private ' +
    'relay", "hide my email", "apple watch unpair", "watchos faces complications", "tvos ' +
    'screensaver aerial", "apple silicon virtualization framework") — never the literal ' +
    'question phrasing.',
  android:
    'If the input looks like Android Enthusiasts SE questions (ANDROID OS / GOOGLE PLAY / ' +
    'CUSTOM ROMS / RECOVERY / ROOT / ADB / FASTBOOT / KERNEL / BATTERY / NOTIFICATIONS / ' +
    'PERMISSIONS — android-power-user-craft framed, NOT apple Thu-09 platform and NOT ' +
    'general consumer computing superuser default and NOT linux-desktop askubuntu Thu-06 ' +
    'default — "How do I [setting] on Android", "Why does my [phone] [behavior]", "How do I ' +
    'flash [rom]", "What does [logcat error] mean"), distill to the android-platform concept ' +
    '(e.g. "android version upgrade", "google play services", "play store apk install", ' +
    '"android system webview", "adb debugging shell", "fastboot bootloader unlock", "oem ' +
    'unlock developer options", "magisk root manager", "kernelsu rooting", "shamiko hide ' +
    'detection", "lsposed module framework", "twrp recovery custom", "orangefox recovery", ' +
    '"lineageos custom rom", "graphene os pixel", "calyx os privacy", "android partition ' +
    'system vendor", "ab partition seamless update", "vbmeta dm verity", "selinux enforce ' +
    'permissive", "apk signature verify", "split apks aab", "f droid open source", "aurora ' +
    'store proxy", "termux linux subsystem", "scrcpy screen mirror", "adb shell pm uninstall", ' +
    '"package disabler debloat", "shizuku adb wireless", "tasker automation app", "macrodroid ' +
    'workflow", "kustom kwgt klwp", "nova launcher prime", "lawnchair launcher", "icon pack ' +
    'theme", "wallpaper engine android", "battery optimization doze", "doze app standby", ' +
    '"standby buckets", "wakelock partial cpu", "background process limit", "adaptive battery ' +
    'pixel", "samsung good lock", "one ui samsung", "miui xiaomi rom", "huawei harmony os", ' +
    '"oxygen os oneplus", "color os oppo", "realme ui", "nothing os phone", "android auto ' +
    'connect", "wear os watch", "android tv shield", "chromecast google tv", "google ' +
    'assistant routine", "digital wellbeing focus", "private dns ad block", "knox samsung ' +
    'enterprise", "work profile dual", "dual sim esim", "vo lte volte ims", "rcs jibe ' +
    'messages", "gcam google camera mod") — never the literal question phrasing.',
  interpersonal:
    'If the input looks like Interpersonal Skills SE questions (INTERPERSONAL ' +
    'COMMUNICATION / CONFLICT RESOLUTION / NEGOTIATION / EMPATHY / ACTIVE LISTENING / ' +
    'BOUNDARIES / FAMILY DYNAMICS / FRIENDSHIP / SOCIAL ANXIETY — interpersonal-skills-craft ' +
    'framed, NOT employee dynamics workplace Fri-06 and NOT mythology Sun-06 and NOT ' +
    'biblical exegesis hermeneutics Sun-20 — "How do I [communicate] with [person]", "How ' +
    'do I handle [awkward situation]", "How do I say no to [request]", "Why does ' +
    '[behavior] bother me"), distill to the interpersonal-skills concept (e.g. "active ' +
    'listening reflection", "empathic listening rogers", "i statements feelings", "non ' +
    'violent communication rosenberg", "nvc observation feeling", "assertive communication ' +
    'training", "passive aggressive behavior", "boundaries personal limits", "saying no ' +
    'graciously", "difficult conversations stone", "crucial conversations patterson", ' +
    '"radical candor scott", "feedback sandwich myth", "kind direct feedback", "constructive ' +
    'criticism delivery", "praise specific behavioral", "conflict resolution mediation", ' +
    '"de escalation calming", "thomas kilmann conflict", "interest based negotiation", ' +
    '"getting to yes fisher", "win win solution", "batna walk away", "empathy perspective ' +
    'taking", "theory of mind", "emotional intelligence goleman", "self awareness self ' +
    'regulation", "social awareness relationship", "high functioning empath", "highly ' +
    'sensitive person", "introvert extrovert spectrum", "social anxiety small talk", "small ' +
    'talk opener", "rapport building mirroring", "active body language", "open posture ' +
    'kinesics", "eye contact comfort", "personal space proxemics", "hall proxemics zones", ' +
    '"micro expressions ekman", "tone register politeness", "saving face hofstede", ' +
    '"high context low context", "five love languages chapman", "attachment style secure", ' +
    '"avoidant attachment anxious", "disorganized attachment", "family systems bowen", "drama ' +
    'triangle karpman", "victim rescuer persecutor", "transactional analysis berne", ' +
    '"gottman four horsemen", "stonewalling contempt criticism", "defensiveness repair ' +
    'attempt", "apology repair making", "non apology fauxpology", "forgiveness reconciliation ' +
    'difference", "trust rebuilding broken", "vulnerability brown shame", "shame guilt ' +
    'distinction", "people pleasing fawn") — never the literal question phrasing.',
  wordpress:
    'If the input looks like WordPress Development SE questions (WORDPRESS CMS / THEMES / ' +
    'PLUGINS / GUTENBERG / WP CORE / HOOKS / FILTERS / WP-CLI / MULTISITE / REST API / ' +
    'CUSTOM POST TYPES / TAXONOMIES — wordpress-cms-power-user-craft framed, NOT general ' +
    'softwareengineering Wed-17 and NOT codereview default hour-17 and NOT cs Thu-17 — ' +
    '"How do I [add feature] in WordPress", "Why does my [plugin] [behavior]", "How do I ' +
    'register [post type]", "What hook fires for [event]"), distill to the wordpress concept ' +
    '(e.g. "wordpress action hooks", "wordpress filter hooks", "wp_enqueue_script", ' +
    '"register_post_type", "register_taxonomy", "custom post types ui", "advanced custom ' +
    'fields acf", "acf flexible content", "wp_query custom loop", "wp_query meta query", ' +
    '"wp_query tax query", "pre_get_posts hook", "the_content filter", "get_template_part", ' +
    '"wordpress block editor", "gutenberg block development", "block.json block type", ' +
    '"register_block_type php", "innerblocks parent child", "block patterns library", ' +
    '"block themes fse", "theme.json site editor", "global styles theme", "wordpress hooks ' +
    'reference", "wp-cli command line", "wp-cli scaffold plugin", "wp-cli search-replace", ' +
    '"wp-cli db export", "wordpress multisite network", "wp_super_cache plugin", "w3 total ' +
    'cache", "wp rocket optimization", "wordpress object cache", "transients api caching", ' +
    '"wordpress rest api", "wp-json endpoint custom", "register_rest_route", "rest field ' +
    'register", "wordpress nonce verify", "wp_verify_nonce csrf", "current_user_can capability", ' +
    '"add_role capability", "wp_handle_upload media", "wp_insert_post programmatic", ' +
    '"wp_update_post meta", "post_meta vs options", "wordpress cron wp_schedule_event", ' +
    '"wp-cron disable real", "wp_mail smtp plugin", "woocommerce hooks filters", "woocommerce ' +
    'product custom", "woocommerce checkout customize", "woocommerce email template", ' +
    '"wpdb prepare sql", "$wpdb->prefix table", "wordpress migrations dbdelta", "child theme ' +
    'override", "functions.php customizations", "wordpress debug log wp_debug", "site health ' +
    'check", "permalinks rewrite rules", "flush_rewrite_rules", "wordpress shortcodes", ' +
    '"add_shortcode handler", "widgets api register", "customizer api kirki", "wordpress ' +
    'sanitization escaping", "esc_html esc_attr esc_url", "wp_kses_post safe", "wpdb prepare ' +
    'placeholders", "wordpress security hardening", "wordfence sucuri ithemes", "wordpress ' +
    'updates auto core", "managed hosting kinsta wpengine") — never the literal question ' +
    'phrasing.',
  raspberrypi:
    'If the input looks like Raspberry Pi SE questions (RASPBERRY PI HARDWARE / ' +
    'RASPBIAN / PI OS / GPIO / I2C / SPI / UART / CAMERA MODULE / PI ZERO / PI 4 / ' +
    'PI 5 / PICO / SD CARD / HEADLESS — raspberrypi-sbc-hobbyist-craft framed, NOT ' +
    'arduino microcontroller and NOT general consumer electronics ' +
    'electronics-default hour-22 and NOT askubuntu linux-desktop Thu-06 — "How do I ' +
    '[pin] on Pi", "Why does my [pi camera] [behavior]", "How do I boot from [usb]", ' +
    '"What kernel module for [device]"), distill to the raspberry-pi concept (e.g. ' +
    '"raspberry pi gpio pinout", "rpi gpio pull up down", "rpi i2c bus enable", "rpi ' +
    'spi bus enable", "rpi uart serial console", "rpi pwm hardware software", "rpi ' +
    'camera module v3", "rpi camera libcamera vs raspistill", "raspberry pi os ' +
    'bookworm", "raspbian buster bullseye", "raspi-config menu", "rpi headless setup ' +
    'wpa", "ssh enable boot partition", "rpi imager flash sd", "sd card lifespan ' +
    'wear", "rpi boot from usb", "rpi boot from nvme", "compute module 4 cm4", ' +
    '"raspberry pi 5 pcie", "raspberry pi pico rp2040", "pi pico micropython", "pi ' +
    'pico c sdk", "raspberry pi zero 2 w", "rpi power supply 5v 3a", "rpi ' +
    'undervoltage warning", "vcgencmd measure temp", "rpi cooling heatsink fan", ' +
    '"rpi case argon one", "rpi vnc realvnc", "rpi remote desktop xrdp", "rpi ' +
    'octoprint 3d printer", "rpi pi-hole dns blocker", "rpi home assistant haos", ' +
    '"rpi retropie emulation", "rpi recalbox", "rpi kodi libreelec", "rpi volumio ' +
    'audio", "rpi cluster picluster", "rpi balena fleet", "dietpi minimal os", ' +
    '"raspberry pi node-red", "rpi mosquitto mqtt", "rpi docker arm64", "rpi ' +
    'kubernetes k3s", "rpi cross compile arm", "rpi qemu emulate", "device tree ' +
    'overlay dtoverlay", "config.txt tweaks", "cmdline.txt boot params", "rpi led ' +
    'act pwr", "rpi watchdog timer", "rpi rtc ds3231 module", "rpi sense hat lcd ' +
    'hat", "rpi unicorn hat blinkt", "raspberry pi foundation forum", "raspberry pi ' +
    'compute shader", "raspberry pi vulkan v3d", "rpi compute module 5 cm5", "cm5 ' +
    'pcie m.2 hat", "rpi 5 power button", "rpi 5 active cooler", "rpi 5 rp1 chip", ' +
    '"rpi pico 2 rp2350", "pico 2 w wireless", "tinyusb pico stack", "pimoroni inky ' +
    'frame", "adafruit feather rp2040", "circuitpython on pico", "thonny ide python ' +
    'pico", "rpi os lite minimal", "rpi os 64 bit aarch64", "ubuntu mate rpi", ' +
    '"manjaro arm rpi", "lakka emulation rpi", "pi-apps store", "wayland labwc rpi", ' +
    '"rpi connect remote", "lgpio gpio chardev", "gpiod gpioinfo cli", "rpi camera ' +
    'v3 noir", "global shutter camera imx296") — never the literal question ' +
    'phrasing.',
  graphicdesign:
    'If the input looks like Graphic Design SE questions (TYPOGRAPHY / LAYOUT / ' +
    'COLOR THEORY / LOGO DESIGN / BRAND IDENTITY / PRINT PRODUCTION / VECTOR ' +
    'ILLUSTRATION / ADOBE TOOLS / AFFINITY / FIGMA / PRINT VS WEB — ' +
    'graphic-design-craft framed, NOT photo Mon-18 photography craft and NOT ux ' +
    'ui-research default-12 and NOT writing craft writers Sun-21 — "How do I ' +
    '[layout] in [tool]", "Why does my [logo] [look wrong]", "How do I export for ' +
    '[print]", "What font pairs with [type]"), distill to the graphic-design concept ' +
    '(e.g. "typography pairing serif sans", "type hierarchy rag widow", "kerning ' +
    'tracking leading", "ligatures opentype features", "x-height ascender ' +
    'descender", "variable fonts axes", "font licensing webfont", "google fonts open ' +
    'source", "adobe fonts subscription", "color theory complementary triadic", ' +
    '"color contrast wcag", "cmyk vs rgb print", "spot color pantone pms", "rich ' +
    'black versus 100k", "bleed slug crop marks", "trapping overprint print", ' +
    '"imposition booklet binding", "saddle stitch perfect bound", "paper gsm weight ' +
    'stock", "uncoated coated paper", "spot uv emboss foil", "logo design wordmark ' +
    'lettermark", "logo grid construction", "responsive logo system", "brand ' +
    'guidelines style guide", "design tokens figma variables", "atomic design brad ' +
    'frost", "grid system 12 column", "baseline grid leading", "modular scale type", ' +
    '"golden ratio composition", "rule of thirds layout", "white space negative", ' +
    '"gestalt principles proximity", "figma auto layout", "figma components ' +
    'variants", "figma styles tokens", "illustrator vector pen tool", "illustrator ' +
    'pathfinder boolean", "photoshop smart object linked", "indesign master pages", ' +
    '"indesign data merge csv", "affinity designer publisher", "canva templates ' +
    'limits", "iconography pixel grid icons", "svg optimization svgo", "svg sprite ' +
    'icon system", "raster vs vector when", "dpi ppi resolution print", "image ' +
    'export jpeg png webp", "lossless lossy compression", "mockups smart object ' +
    'psd", "presentation deck design", "optical sizing variable font", "italic ' +
    'oblique distinction", "drop cap initial letter", "small caps petite caps", ' +
    '"lining oldstyle figures", "tabular proportional figures", "fractions stylistic ' +
    'alts", "swash contextual alternates", "smart quotes primes", "em en dash ' +
    'hyphen", "non breaking space", "widow orphan control", "rivers white text", ' +
    '"type measure characters", "leading line height ratio", "monochromatic split ' +
    'complementary", "tetradic analogous palette", "cmyk gamut conversion", "die ' +
    'line packaging", "knockout type registration", "halftone dot gain", "lpi screen ' +
    'ruling print", "ink limit tac", "pdf x-1a x-4 standard", "preflight acrobat ' +
    'check", "spot color separation", "metallic foil stamping", "deboss letterpress ' +
    'impression") — never the literal question phrasing.',
  crypto:
    'If the input looks like Cryptography SE questions (CRYPTOGRAPHIC PRIMITIVES / SYMMETRIC ' +
    '/ ASYMMETRIC / HASH FUNCTIONS / KEY EXCHANGE / DIGITAL SIGNATURES / ZERO-KNOWLEDGE / ' +
    'PROTOCOLS / TLS / POST-QUANTUM — cryptography-theory-craft framed, NOT security ' +
    'practitioner-default hour-7 applied infosec and NOT ethereum Mon-19 blockchain and ' +
    'NOT money default-04 personal finance — "Why is [primitive] secure", "How does ' +
    '[protocol] work", "Is [scheme] vulnerable to [attack]", "What is the difference between ' +
    '[a] and [b]"), distill to the cryptography concept (e.g. "aes block cipher modes", ' +
    '"aes-gcm aead authenticated", "chacha20-poly1305 stream", "ecb cbc ctr modes", ' +
    '"counter mode iv reuse", "rsa key generation", "rsa-oaep padding", "rsa-pss signature", ' +
    '"elliptic curve ecdh", "elliptic curve ecdsa", "ed25519 eddsa schnorr", "curve25519 ' +
    'x25519 dh", "secp256k1 bitcoin curve", "diffie hellman key exchange", "discrete ' +
    'logarithm hardness", "factoring rsa hardness", "sha-256 sha-512 family", "sha-3 keccak ' +
    'sponge", "blake2 blake3 fast hash", "hmac construction", "kdf hkdf scrypt argon2", ' +
    '"argon2id memory hard", "bcrypt password hashing", "pbkdf2 iterations", "tls 1.3 ' +
    'handshake", "noise protocol framework", "signal protocol double ratchet", "x3dh key ' +
    'agreement", "post-quantum kyber ml-kem", "post-quantum dilithium ml-dsa", "lattice ' +
    'based crypto lwe", "ring lwe rlwe", "code based mceliece", "hash based signatures ' +
    'sphincs", "zero knowledge proof zkp", "zk-snark groth16", "plonk halo2", "stark fri ' +
    'protocol", "bulletproofs range proof", "schnorr signatures multi", "musig2 schnorr ' +
    'aggregation", "threshold signatures frost", "shamir secret sharing", "feldman vss ' +
    'verifiable", "homomorphic encryption fhe", "bfv ckks tfhe", "secure multiparty ' +
    'computation mpc", "garbled circuits yao", "oblivious transfer ot", "private information ' +
    'retrieval pir", "padding oracle attack", "side channel timing", "side channel power ' +
    'analysis", "fault injection rowhammer", "differential cryptanalysis", "linear ' +
    'cryptanalysis", "birthday attack collision", "preimage second-preimage", "constant time ' +
    'implementation", "ind-cpa ind-cca security") — never the literal question phrasing.',
  arduino:
    'If the input looks like Arduino SE questions (ARDUINO MICROCONTROLLER / AVR / SAMD / ' +
    'ESP / SHIELDS / SENSORS / SERIAL / I2C / SPI / PWM / IDE / LIBRARIES — arduino-' +
    'microcontroller-hobbyist-craft framed, NOT raspberrypi-sbc-hobbyist Tue-18 SBC and ' +
    'NOT general consumer electronics electronics default-22 and NOT dsp default-10 — ' +
    '"How do I [pin] on Arduino", "Why does my [sensor] [behavior]", "How do I send ' +
    '[data] over [serial]", "What library for [chip]"), distill to the arduino concept ' +
    '(e.g. "arduino uno r3 atmega328p", "arduino mega 2560 pinout", "arduino nano clone ' +
    'ch340", "arduino pro mini ftdi", "arduino due sam3x", "arduino zero samd21", "arduino ' +
    'mkr wifi 1010", "arduino nano 33 ble", "arduino nano 33 iot", "arduino nano esp32", ' +
    '"esp32 wroom devkit", "esp8266 nodemcu wemos", "esp32-c3 esp32-s3 risc-v", "atmega ' +
    'fuse bits", "avr-gcc toolchain", "platformio vs ide", "arduino ide 2.x", "library ' +
    'manager install zip", "wire i2c library", "spi library transfer", "softwareserial ' +
    'limitations", "neosoftwareserial bufferless", "interrupts attachinterrupt", "millis ' +
    'overflow rollover", "non blocking delay", "watchdog timer wdt", "sleep mode power ' +
    'save", "battery low power lipo", "boost converter buck", "level shifter 3v3 5v", ' +
    '"i2c pull up resistor", "spi mode polarity phase", "uart baud rate clock", "rs485 ' +
    'modbus arduino", "can bus mcp2515", "lora sx1276 radio", "nrf24l01 wireless", "esp-now ' +
    'wifi mesh", "ble nrf52 nordic", "bluetooth classic hc05", "wifi manager autoconnect", ' +
    '"ota update arduino", "espasyncwebserver", "asyncmqttclient", "homie iot framework", ' +
    '"tasmota custom firmware", "esphome yaml config", "fastled neopixel ws2812", "tft ' +
    'display ili9341", "oled ssd1306 i2c", "epaper waveshare display", "stepper motor ' +
    'driver a4988", "tmc2208 silent driver", "servo motor pwm control", "dc motor h bridge ' +
    'l298n", "mosfet driver gate", "rotary encoder ky040", "matrix keypad scan", "capacitive ' +
    'touch tt5p", "load cell hx711", "thermocouple max6675", "ds18b20 onewire", "dht22 ' +
    'humidity timing", "bme280 environment i2c", "mpu6050 imu i2c", "ultrasonic hc-sr04 ' +
    'ranging", "pir motion sensor", "rtc ds3231 backup") — never the literal question ' +
    'phrasing.',
  drupal:
    'If the input looks like Drupal Answers SE questions (DRUPAL CMS / MODULES / THEMES / ' +
    'TWIG / DRUSH / COMPOSER / VIEWS / FIELD API / ENTITY API / HOOKS / BLOCKS / ' +
    'CONFIGURATION MANAGEMENT — drupal-cms-power-user-craft framed, NOT wordpress Mon-17 ' +
    'cms and NOT softwareengineering Wed-17 generic SE and NOT cs Thu-17 — "How do I ' +
    '[create module] in Drupal", "Why does my [view] [behavior]", "How do I migrate from ' +
    '[d7 to d10]", "What hook fires on [event]"), distill to the drupal concept (e.g. ' +
    '"drupal 10 symfony 6", "drupal 11 release", "drupal core composer", "drush command ' +
    'cli", "drush updb cr", "drush en pm-uninstall", "configuration management cmi", ' +
    '"config split environments", "configuration sync yaml", "drupal hooks alter", ' +
    '"hook_form_alter targeted", "hook_entity_presave", "hook_node_access grants", ' +
    '"entity api drupal", "field api custom", "field types widgets formatters", "entity ' +
    'reference field", "paragraphs module nested", "views module ui", "views relationships ' +
    'contextual", "views block display", "views rest export", "twig template overrides", ' +
    '"theme suggestions hook", "preprocess function variables", "render array build", ' +
    '"theme custom layout", "layout builder module", "media library entity", "media ' +
    'reference inline", "menu link content", "permissions roles users", "user permissions ' +
    'matrix", "block module placement", "block visibility conditions", "context module ' +
    'd7", "rules module d8 ecv", "ecv eca workflow", "workflows content moderation", ' +
    '"content moderation states", "moderation editorial workflow", "translatable entities ' +
    'i18n", "drupal commerce 2.x", "commerce product variations", "commerce checkout ' +
    'flow", "search api solr", "facets module configurable", "pathauto url alias", ' +
    '"redirect module 301", "metatag module token", "schema metatag jsonld", "drupal ' +
    'security update", "drupal security advisories", "private files private://", "image ' +
    'styles derivative", "responsive image picture", "drupal coding standards phpcs", ' +
    '"drupal check phpstan", "phpunit functional kernel") — never the literal question ' +
    'phrasing.',
  mathematica:
    'If the input looks like Mathematica SE questions (WOLFRAM LANGUAGE / ' +
    'MATHEMATICA / PATTERN MATCHING / SYMBOLIC COMPUTATION / NOTEBOOKS / DYNAMIC / ' +
    'GRAPHICS / NUMERICAL / PACKAGES — wolfram-language-craft framed, NOT general ' +
    'math math-default hour-9 and NOT scicomp Mon-15 numerical-methods and NOT ' +
    'cstheory Fri-11 theoretical-cs — "How do I [evaluate] in Mathematica", "Why ' +
    'does [function] [behavior]", "How do I plot [expression]", "What is the ' +
    'difference between [a] and [b]"), distill to the wolfram concept (e.g. ' +
    '"mathematica pattern matching", "blank blanksequence blanknullsequence", "hold ' +
    'holdfirst holdrest", "evaluate unevaluated", "replaceall replacerepeated", "set ' +
    'vs setdelayed", "upvalues downvalues subvalues", "module block with scoping", ' +
    '"pure functions slot", "function compositional operators", "map mapindexed", ' +
    '"apply @@ @@@", "thread inner outer", "fold foldlist nest nestlist", "table do ' +
    'for which", "compile compiledfunction", "parallelize parallelmap", "kernel ' +
    'subkernel launch", "associations key lookup", "dataset query operations", ' +
    '"wolframfunctionrepository", "resource function load", "package context begin", ' +
    '"begin end private namespace", "paclet package manager", "wolfram cloud ' +
    'notebooks", "manipulate dynamic interactive", "dynamicmodule trackedsymbols", ' +
    '"graphics primitives", "graphics3d viewpoint", "plot plot3d listplot", ' +
    '"contourplot densityplot", "regionplot vectorplot", "streamplot ' +
    'streamdensityplot", "graph graphdata", "wolframalpha integration", "natural ' +
    'language parsing", "free-form input wolfram", "numerical precision arbitrary", ' +
    '"machine precision double", "$machineprecision $machineepsilon", "interval ' +
    'arithmetic", "ndsolve differential equations", "fitting nonlinearmodelfit", ' +
    '"linearsolve matrixrank", "eigen eigenvectors eigenvalues", "fourier ' +
    'discretefourier", "wavelet waveletphi", "image processing imagedata", ' +
    '"machineLearning predict classify", "neural networks netchain", "netgraph ' +
    'netencoder netdecoder", "import export json csv", "compileddataset", ' +
    '"externalevaluate python", "wolframscript cli", "nestwhile until convergence", ' +
    '"fixedpoint convergence", "matchq pattern check", "cases extract level", ' +
    '"position select all", "deletecases drop", "sortby key sort", "groupby ' +
    'aggregation", "merge associations join", "queryoperator dataset", "interval ' +
    'intersection arithmetic", "regionunion regionintersection", "discretizeregion ' +
    'mesh", "elementmesh fem", "ndsolve method options", "stiff solver implicit", ' +
    '"delay differential equations", "stochastic differential ndsolve", "tabview ' +
    'selection", "graphicsgrid grid layout", "barchart piechart bubblechart", ' +
    '"smoothhistogram density", "geoposition geodistance", "datelistplot ' +
    'timeseries", "audio spectrogram analysis") — never the literal question ' +
    'phrasing.',
  vi:
    'If the input looks like Vi/Vim SE questions (VI / VIM / NEOVIM / EX / NORMAL MODE / ' +
    'VISUAL MODE / OPERATORS / MOTIONS / TEXT OBJECTS / REGISTERS / MAPPINGS / VIMSCRIPT / ' +
    'LUA / PLUGINS — vim-power-user-craft framed, NOT emacs Mon-21 elisp-craft and NOT ' +
    'superuser default-21 consumer-os and NOT softwareengineering Wed-17 — "How do I ' +
    '[motion] in Vim", "Why does my [keymap] [behavior]", "How do I configure [plugin]", ' +
    '"What is the difference between [normal] and [visual]"), distill to the vim concept ' +
    '(e.g. "vim modal editing", "normal mode commands", "visual mode block", "operator ' +
    'pending mode", "text objects iw aw", "text objects ip ap", "motion w b e ge", "motion ' +
    'f t F T", "motion h j k l", "registers named numbered", "yank delete change", "macros ' +
    'q recording", "marks m goto", "search and replace", "substitute s flags", "global ' +
    'command g", "ex command line", "ranges line number", "command line history", "command ' +
    'completion wildmenu", "buffers windows tabs", "splits vsplit hsplit", "argument list ' +
    'args", "quickfix list cnext", "location list lnext", "vimscript variables", "vimscript ' +
    'functions", "vim9script types", "lua nvim api", "init lua config", "init vim config", ' +
    '"vimrc autoload plugin", "key mappings nnoremap", "leader key prefix", "autocmd events ' +
    'pattern", "groups au clear", "filetype detection ftdetect", "syntax highlighting ' +
    'syntax", "colorscheme highlight", "treesitter parser", "lsp client builtin", "nvim ' +
    'lspconfig setup", "telescope fuzzy finder", "fzf vim plugin", "packer lazy nvim", ' +
    '"plug vim plugin manager", "vundle pathogen legacy", "fugitive git plugin", "gitgutter ' +
    'signs", "nerdtree tree", "netrw filesystem", "easymotion sneak", "surround vim ' +
    'mappings", "commentary tcomment", "ultisnips luasnip", "completion coc nvim cmp", ' +
    '"snippet engine", "folding markers expr", "tabs spaces expandtab", "indent listchars ' +
    'tabstop", "wrap linebreak nowrap", "swap files undofile", "session save mksession") — ' +
    'never the literal question phrasing.',
  robotics:
    'If the input looks like Robotics SE questions (ROBOTICS / ROS / ROS2 / KINEMATICS / ' +
    'DYNAMICS / SLAM / NAVIGATION / SENSORS / ACTUATORS / CONTROL THEORY / MOTION PLANNING / ' +
    'PERCEPTION — robotics-control-craft framed, NOT arduino Wed-18 microcontroller-craft ' +
    'and NOT raspberrypi Tue-18 SBC-craft and NOT electronics default-22 EE and NOT ' +
    'engineering Thu-22 mechanical-craft and NOT ai Mon-13 ML-theory — "How do I ' +
    '[plan path] for [robot]", "Why does my [controller] [behavior]", "How do I tune ' +
    '[pid]", "What sensor for [task]"), distill to the robotics concept (e.g. "ros2 humble ' +
    'iron", "ros1 noetic melodic", "ros nodes topics services", "ros actions params", "rosbag ' +
    'record play", "rqt visualization", "rviz coordinate frames", "tf2 transform tree", "urdf ' +
    'robot description", "xacro macros parameters", "moveit motion planning", "ompl planners ' +
    'rrt", "navigation stack nav2", "amcl monte carlo", "gmapping cartographer slam", "rtabmap ' +
    'visual slam", "orb slam3 visual inertial", "kalman filter ekf ukf", "particle filter ' +
    'localization", "extended kalman robot pose", "complementary filter imu", "madgwick imu ' +
    'fusion", "forward kinematics dh", "inverse kinematics jacobian", "denavit hartenberg ' +
    'parameters", "screw theory exponential", "lie groups so3 se3", "quaternion rotation", ' +
    '"euler angles gimbal", "rotation matrix orthonormal", "homogeneous transformation", ' +
    '"pid controller tuning", "lqr optimal control", "mpc model predictive", "trajectory ' +
    'optimization", "rrt star path", "a star grid planning", "dijkstra shortest path", ' +
    '"voronoi roadmap", "potential fields obstacle", "dwa local planner", "teb timed ' +
    'elastic", "control barrier functions", "lyapunov stability", "passivity based control", ' +
    '"computed torque manipulator", "impedance control compliance", "force torque sensing", ' +
    '"tactile skin sensing", "lidar velodyne ouster", "stereo camera disparity", "depth ' +
    'camera realsense", "imu mems gyroscope", "encoder quadrature counts", "servo motor ' +
    'pwm robotics", "stepper driver microstep", "differential drive odometry", "ackermann ' +
    'steering geometry", "omnidirectional mecanum wheel", "manipulator dof workspace", ' +
    '"humanoid bipedal walking", "quadruped gait pattern", "drone quadrotor px4", "ardupilot ' +
    'mission planner", "gazebo classic ignition", "isaac sim nvidia", "webots simulator", ' +
    '"pybullet bullet physics") — never the literal question phrasing.',
  magento:
    'If the input looks like Magento SE questions (MAGENTO / ADOBE COMMERCE / M1 / M2 / ' +
    'CATALOG / CHECKOUT / EAV / ORM / PLUGINS / OBSERVERS / DI / LAYOUT XML / KNOCKOUT / ' +
    'CLI BIN MAGENTO — magento-ecommerce-craft framed, NOT wordpress Mon-17 cms-craft and ' +
    'NOT drupal Thu-18 cms-craft and NOT softwareengineering Wed-17 architecture-craft — ' +
    '"How do I [add module] in Magento", "Why does my [product] [behavior]", "How do I ' +
    'override [block]", "What event fires on [action]"), distill to the magento concept ' +
    '(e.g. "magento 2 architecture", "magento 1 deprecation", "magento 2.4 elastic search", ' +
    '"magento adobe commerce", "magento open source", "module xml registration", "composer ' +
    'magento package", "di xml virtual type", "di xml plugin", "di xml preference", ' +
    '"plugins before after around", "observer events xml", "events listener custom", ' +
    '"layout xml handle", "default xml block", "container reference move", "block template ' +
    'phtml", "page xml updates", "view layer phtml", "ui components form", "ui components ' +
    'listing", "knockout bindings magento", "knockout viewmodel component", "requirejs ' +
    'config define", "static content deploy", "setup upgrade install", "setup install ' +
    'schema", "data patches patch", "upgrade data revert", "eav entity attribute", "eav ' +
    'attribute set", "eav sources backend", "catalog product type", "catalog category ' +
    'indexer", "indexer mode schedule", "cron groups configuration", "queue consumer ' +
    'worker", "message queue rabbit", "checkout step custom", "checkout shipping payment", ' +
    '"payment method offline", "payment gateway adapter", "shipping carrier rate", "tax ' +
    'rules zones", "stock multi source", "inventory msi reservations", "salesrule promotion ' +
    'catalog", "cart price rule", "customer attribute custom", "address attribute eav", ' +
    '"graphql schema resolver", "graphql custom mutation", "rest api swagger", "soap api ' +
    'fallback", "acl resources xml", "admin menu xml", "system xml configuration", ' +
    '"config xml defaults", "store views website", "scope default website store", "url ' +
    'rewrite enabled", "static block widget", "cms page widget", "varnish full page cache", ' +
    '"redis session cache", "elasticsearch 7 8", "cli setup di compile", "cli setup static ' +
    'deploy", "cli cache clean flush", "deploy mode production developer", "log debug ' +
    'system var") — never the literal question phrasing.',
  softwarerecs:
    'If the input looks like Software Recommendations SE questions (SOFTWARE / APP / TOOL ' +
    'RECOMMENDATIONS / ALTERNATIVES / FREE VS PAID / OPEN SOURCE / CROSS PLATFORM / FOSS — ' +
    'software-recommendations-craft framed, NOT softwareengineering Wed-17 architecture and ' +
    'NOT opensource Mon-12 licensing-governance and NOT superuser default-21 fix-my-machine ' +
    'and NOT askubuntu default-06 ubuntu-specific — "What software for [task]", "Alternative ' +
    'to [tool]", "Free [category] app", "Cross platform [purpose] tool"), distill to the ' +
    'recommendation-domain concept (e.g. "note taking obsidian alternatives", "task ' +
    'management apps", "kanban board software", "todo list applications", "password ' +
    'manager comparison", "bitwarden 1password keepass", "self hosted password vaultwarden", ' +
    '"two factor authenticator apps", "vpn provider comparison", "mail client thunderbird ' +
    'alternatives", "calendar app cross platform", "rss reader applications", "bookmark ' +
    'manager raindrop", "screenshot tool comparison", "screen recorder obs", "video editor ' +
    'open source", "audio editor audacity alternatives", "image editor gimp affinity", ' +
    '"raw photo lightroom alternatives", "vector graphics inkscape", "mind mapping ' +
    'software", "diagramming drawio lucidchart", "wiki self hosted bookstack", "static ' +
    'site generator hugo", "dropbox google drive alternative", "sync nextcloud syncthing", ' +
    '"backup tool restic borg", "encryption veracrypt cryptomator", "secure messenger ' +
    'signal element", "email server self hosted", "vpn wireguard tailscale", "reverse ' +
    'proxy caddy traefik", "container orchestration k3s", "home automation home assistant", ' +
    '"media server jellyfin plex", "torrent client qbittorrent", "download manager aria2", ' +
    '"file manager dolphin nautilus", "terminal emulator alacritty kitty", "shell zsh fish ' +
    'nushell", "code editor vscode alternatives", "ide jetbrains alternatives", "git ' +
    'client gui sourcetree", "markdown editor typora obsidian", "pdf reader sumatrapdf ' +
    'zathura", "ebook reader calibre koreader", "video player mpv vlc", "music player ' +
    'rhythmbox strawberry", "podcast manager antennapod", "rss aggregator freshrss tt rss", ' +
    '"matrix client element cinny", "discord alternative revolt", "slack alternative ' +
    'rocketchat mattermost", "zoom alternative jitsi bigbluebutton", "office suite ' +
    'libreoffice onlyoffice", "spreadsheet comparison", "presentation alternative pinpoint", ' +
    '"database client dbeaver beekeeper") — never the literal question phrasing.',
  retrocomputing:
    'If the input looks like Retrocomputing SE questions (RETROCOMPUTING / VINTAGE / 8-BIT / ' +
    '16-BIT / Z80 / 6502 / 68000 / COMMODORE / ATARI / APPLE II / IBM PC / DOS / CP/M / ' +
    'AMIGA / BBC MICRO / SPECTRUM — vintage-computing-craft framed, NOT cs Thu-17 ' +
    'theory-craft and NOT softwareengineering Wed-17 architecture and NOT reverseengineering ' +
    'Wed-12 modern-RE — "How did [old machine] handle [task]", "Why does [vintage chip] ' +
    '[behavior]", "How do I emulate [classic system]"), distill to the retrocomputing concept ' +
    '(e.g. "z80 cpu instruction set", "6502 assembly addressing modes", "68000 motorola cpu", ' +
    '"8086 real mode", "intel 8080 architecture", "mos 6510 commodore", "commodore 64 vic ' +
    'ii", "commodore 64 sid chip", "commodore amiga copper", "amiga blitter chipset", "atari ' +
    '2600 vcs", "atari 800 antic gtia", "atari st gem", "apple ii woz integrated", "apple iie ' +
    'enhanced", "apple iigs ensoniq", "ibm pc xt 5150", "ibm pc at 286", "ibm pc cga ega ' +
    'vga", "tandy color computer", "trs 80 model i", "bbc micro acorn", "zx spectrum ula", ' +
    '"zx81 sinclair", "amstrad cpc gate array", "msx z80 standard", "nec pc 9801", "fm towns ' +
    'fujitsu", "sharp x68000", "cp/m 80 dr", "ms dos 3.3 6.22", "dos pc dos", "freedos ' +
    'open source", "dos extender dos4gw", "windows 3.1 win32s", "windows 95 plug play", ' +
    '"os/2 warp", "geos commodore", "gem desktop atari", "rom basic interpreter", "applesoft ' +
    'basic floating", "gw basic qbasic", "turbo pascal borland", "turbo c borland", "lattice ' +
    'c amiga", "manx aztec c", "watcom c dos", "dosbox emulator", "vice commodore emulator", ' +
    '"mame mess emulator", "frodo c64 emulator", "fuse zx spectrum", "winuae amiga", "stella ' +
    'atari 2600", "openmsx emulator", "pcem ibm pc", "86box emulator", "qemu old systems", ' +
    '"floppy disk 5.25 8 inch", "tape cassette load", "rs 232 serial", "centronics parallel", ' +
    '"ide pata atapi", "scsi narrow wide", "isa eisa vlb pci", "soundblaster ad lib", "mt 32 ' +
    'roland mpu", "modem hayes at command", "bbs door doors", "fidonet usenet uucp", "ansi ' +
    'art shareware", "demo scene cracktro") — never the literal question phrasing.',
  avp:
    'If the input looks like Audio/Video Production SE questions (AVP / AUDIO / VIDEO / FILM ' +
    'PRODUCTION / EDITING / NLE / DAW / COLOR GRADING / VFX / MIXING / MASTERING / FOLEY / ' +
    'RENDERING — av-production-craft framed, NOT music Mon-11 theory and NOT photo Mon-18 ' +
    'stills-craft and NOT graphicdesign Sat-17 print-craft and NOT sound Sun-12 audio-eng — ' +
    '"How do I export [codec]", "Why does my [edit] [behavior]", "How do I sync [audio video]", ' +
    '"What [filter] for [effect]"), distill to the av-production concept (e.g. "premiere pro ' +
    'davinci", "final cut pro magnetic", "davinci resolve color", "avid media composer", ' +
    '"after effects compositing", "fusion node compositing", "blender vse editing", "kdenlive ' +
    'shotcut", "openshot natron", "pro tools daw", "logic pro x", "ableton live session", ' +
    '"reaper digital audio", "cubase nuendo", "studio one presonus", "fl studio image line", ' +
    '"audacity audio editor", "ardour open daw", "izotope rx restoration", "waves plugins ' +
    'bundle", "fabfilter pro q", "valhalla reverb", "ozone mastering chain", "neutron mix ' +
    'assistant", "color grading lut", "lut 3d 1d", "color space rec 709", "rec 2020 hdr", ' +
    '"aces color pipeline", "log raw codec", "prores 422 hq 4444", "dnxhd dnxhr", "h264 h265 ' +
    'hevc av1", "vp9 webm codec", "audio codec aac flac", "mp3 ogg opus", "sample rate 48k ' +
    '96k", "bit depth 16 24", "lufs loudness target", "ebu r128 broadcast", "sidechain ' +
    'compression ducking", "multiband compressor mastering", "limiter brickwall", "eq ' +
    'parametric subtractive", "deesser plosives", "reverb plate hall room", "delay analog ' +
    'tape", "noise reduction spectral", "click pop removal", "vocal tuning melodyne", "auto ' +
    'tune pitch", "drum replacement triggering", "chroma key green screen", "rotoscoping ' +
    'mask", "tracking 2d 3d", "match move pftrack", "stabilization warp", "speed ramp ' +
    'optical", "transitions cuts dissolves", "title lower thirds", "broadcast safe legal") — ' +
    'never the literal question phrasing.',
  sustainability:
    'If the input looks like Sustainable Living SE questions (SUSTAINABILITY / GREEN / ' +
    'CIRCULAR ECONOMY / RENEWABLES / ENERGY EFFICIENCY / CLIMATE / FOOTPRINT / WASTE / ' +
    'COMPOST / RECYCLING — sustainability-living-craft framed, NOT earthscience Sat-04 ' +
    'geosci and NOT gardening Sat-19 horticulture and NOT homebrew Sat-11 brewing and NOT ' +
    'diy default-05 home-build — "How do I reduce [footprint]", "What is more sustainable ' +
    '[option a vs b]", "How do I compost [material]"), distill to the sustainability concept ' +
    '(e.g. "carbon footprint household", "scope 1 2 3 emissions", "lca life cycle assessment", ' +
    '"embodied carbon construction", "net zero carbon", "carbon offset credits", "renewable ' +
    'energy solar pv", "wind turbine residential", "heat pump efficiency cop", "passive house ' +
    'standard", "insulation r value", "double triple glazing", "led lighting efficacy", ' +
    '"smart thermostat", "vampire phantom load", "energy monitor whole home", "rooftop solar ' +
    'panels", "battery storage powerwall", "ev electric vehicle", "ev charger level 2", ' +
    '"public transit reducing", "cycling commute", "walkable city design", "15 minute city", ' +
    '"composting kitchen scraps", "vermicompost worm bin", "bokashi anaerobic", "hot compost ' +
    'pile", "humanure composting toilet", "greywater system reuse", "rainwater harvesting", ' +
    '"low flow shower toilet", "drought tolerant landscaping", "xeriscaping native plants", ' +
    '"food miles local", "seasonal eating produce", "plant based diet", "reducing meat ' +
    'consumption", "food waste prevention", "freezer pantry rotation", "zero waste shopping", ' +
    '"bulk bins package free", "reusable cloth bags", "menstrual cup cloth pads", "cloth ' +
    'diapers vs disposable", "minimalism decluttering", "buy nothing groups", "freecycle ' +
    'sharing", "repair cafe right to repair", "secondhand thrift", "circular economy loop", ' +
    '"upcycling diy projects", "biodegradable bioplastic pla", "recyclable plastics rin 1 7", ' +
    '"glass aluminum infinitely", "paper cardboard fiber", "ewaste electronics recycling", ' +
    '"textile recycling fabric", "fast fashion impact", "ethical clothing brands", "fair ' +
    'trade certification") — never the literal question phrasing.',
  tor:
    'If the input looks like Tor SE questions (TOR / ANONYMITY / ONION SERVICES / HIDDEN ' +
    'SERVICES / TOR BROWSER / RELAYS / BRIDGES / EXIT NODES / OBFS4 / SNOWFLAKE — ' +
    'tor-anonymity-network framed, NOT security default-07 appsec and NOT crypto Sun-04 ' +
    'cryptocurrency and NOT softwarerecs Sun-17 software-recommendations — "How do I ' +
    '[hide / anonymize] [traffic]", "Why does [tor browser] [behavior]", "How do I run a ' +
    '[relay / bridge / onion]"), distill to the tor-network concept (e.g. "tor browser ' +
    'bundle", "tor circuit selection", "tor guard middle exit", "onion service v3 address", ' +
    '"hidden service descriptor", "rendezvous point introduction", "tor directory authorities", ' +
    '"consensus document signing", "torrc configuration file", "control port stem", "tor ' +
    'controller bandwidth", "exit policy reduced", "exit node enclave", "exit relay legal", ' +
    '"middle relay node", "guard relay entry", "bridge relay obfs4", "obfs4 pluggable transport", ' +
    '"meek azure cdn", "snowflake webrtc bridge", "scramblesuit pt", "fteproxy regex", "tor ' +
    'network family", "tor metrics portal", "tor consensus weights", "tor stream isolation", ' +
    '"socksport per origin", "tor onion routing", "ntor handshake", "circuit padding", "vanguard ' +
    'layer protection", "guard rotation period", "tor over vpn", "vpn over tor", "tails amnesic ' +
    'live", "whonix workstation gateway", "qubes tor proxy", "tor firefox patches", "tor browser ' +
    'fingerprint resistance", "letterboxing window size", "noscript tor browser", "https only ' +
    'mode", "tor security slider", "javascript disabled level", "tor browser updater", "deb ' +
    'apt tor sources", "tor expert bundle", "vidalia legacy", "nyx terminal monitor", "arm tor ' +
    'monitor", "tor stem python api", "txtorcon twisted", "stem descriptor parse", "exonerator ' +
    'tool lookup", "atlas relay search", "tor blog announcements", "tor project nonprofit", ' +
    '"hidden wiki dark", "ahmia search engine", "tor2web gateway", "onion routing concept", ' +
    '"opsec for activists", "anonymous publishing securedrop", "ricochet refresh chat", "cwtch ' +
    'p2p", "briar tor mesh", "ooni network observatory") — never the literal question phrasing.',
  iot:
    'If the input looks like Internet of Things SE questions (IOT / CONNECTED DEVICES / SENSORS ' +
    '/ ACTUATORS / MQTT / COAP / ZIGBEE / Z-WAVE / MATTER / THREAD / LORAWAN / EDGE COMPUTING — ' +
    'iot-protocol-cloud framed, NOT arduino Wed-18 microcontroller-craft and NOT raspberrypi ' +
    'Tue-18 sbc-projects and NOT electronics default-22 hardware-design and NOT homeassistant ' +
    'subset — "How do I connect [device] to [cloud]", "Why does [protocol] [behavior]", ' +
    '"What [stack] for [iot use case]"), distill to the iot concept (e.g. "mqtt broker mosquitto", ' +
    '"mqtt qos 0 1 2", "mqtt retained messages", "mqtt last will testament", "mqtt topic ' +
    'hierarchy", "coap constrained application", "coap observe resource", "coap dtls security", ' +
    '"lwm2m device management", "amqp message queue", "stomp text protocol", "zigbee 3 0 ' +
    'mesh", "zigbee coordinator router", "zigbee binding cluster", "z wave plus s2", "z wave ' +
    'inclusion exclusion", "thread border router", "thread mesh ipv6", "matter over wifi", ' +
    '"matter over thread", "matter commissioner fabric", "homekit accessory protocol", "lorawan ' +
    'class a b c", "lora chirp spread", "narrowband nbiot lte m", "sigfox uplink subgig", "wifi ' +
    'halow 802 11ah", "ble peripheral central", "ble gatt service characteristic", "ble mesh ' +
    'flooding", "esp32 wifi softap", "esp32 deep sleep", "esp8266 nodemcu", "raspberry pi pico ' +
    'rp2040", "stm32 cube ide", "nrf52 nordic", "edge tpu coral", "tinyml inference", "tensorflow ' +
    'lite micro", "edge impulse studio", "particle photon argon", "balena cloud fleet", "aws iot ' +
    'core", "azure iot hub", "google cloud iot", "thingsboard open", "node red dashboard", "home ' +
    'assistant integration", "openhab habpanel", "domoticz zwave", "tuya cloud local", "tasmota ' +
    'firmware", "espurna firmware", "esphome yaml", "shelly local api", "modbus rtu tcp", "opc ' +
    'ua server client", "rest api over http", "websocket realtime sensor", "ota firmware update", ' +
    '"cellular gsm 4g lte iot", "low power deep sleep", "battery life lifecycle", "secure boot ' +
    'chain trust", "device attestation tpm", "x509 device certificates") — never the literal ' +
    'question phrasing.',
  musicfans:
    'If the input looks like Music Fans SE questions (MUSIC FANS / DISCOVERY / GENRES / ARTIST ' +
    'HISTORY / DISCOGRAPHIES / ALBUM IDENTIFICATION / SONG LYRICS / RECORD COLLECTING — ' +
    'music-fandom-craft framed, NOT music Mon-11 theory and NOT avp Tue-11 production and ' +
    'NOT sound Sun-12 audio-eng and NOT graphicdesign Sat-17 print-craft — "Who is the [artist] ' +
    'behind [song]", "What album contains [track]", "How do I identify [genre / era]"), distill ' +
    'to the music-fan concept (e.g. "shazam song identification", "soundhound humming", "musicbrainz ' +
    'database", "discogs marketplace", "rateyourmusic ranked", "allmusic biography", "genius ' +
    'lyrics annotations", "lastfm scrobble history", "setlist fm concert", "concert ticketing ' +
    'resale", "vinyl record collecting", "first pressing original", "test pressing rare", ' +
    '"colored vinyl variant", "180 gram audiophile", "shellac 78 rpm", "10 inch ep", "12 inch ' +
    'maxi single", "compact cassette dolby", "minidisc nostalgia", "reel to reel tape", "8 ' +
    'track cartridge", "compact disc redbook", "sacd dsd hybrid", "dvd audio surround", "high ' +
    'resolution audio", "lossless flac alac", "lossy mp3 aac comparison", "tidal masters ' +
    'mqa", "qobuz hi res", "spotify recommendation algorithm", "apple music spatial dolby ' +
    'atmos", "deezer flac quality", "youtube music topic channel", "soundcloud upload tags", ' +
    '"bandcamp artist support", "patreon music fan club", "fan funded album", "kickstarter ' +
    'pressing", "hipinion forum", "dimeadozen lossless", "etree taper community", "live ' +
    'music archive", "boots leg recording", "audience tape soundboard", "remaster reissue ' +
    'campaign", "deluxe expanded edition", "box set rarities", "outtakes alternate take", ' +
    '"unreleased material vault", "cover song originals", "sample identification breakbeat", ' +
    '"whosampled credit chain", "music genome project", "pandora similar artists", "essential ' +
    'tracks era", "rolling stone 500", "pitchfork best new", "metacritic aggregate score", ' +
    '"rolling rating retrospective", "year end list albums", "decade defining records", ' +
    '"music journalism criticism", "ethnomusicology field recording", "world music genre", ' +
    '"genre classification taxonomy") — never the literal question phrasing.',
  pm:
    'If the input looks like Project Management SE questions (PROJECT MANAGEMENT / PMBOK / PMI / ' +
    'AGILE / SCRUM / KANBAN / WATERFALL / RISK / SCOPE / SCHEDULE / STAKEHOLDER / TEAM — ' +
    'project-management-craft framed, NOT workplace Fri-06 office-people and NOT softwareengineering ' +
    'Wed-17 architecture and NOT freelancing Fri-09 solo-business and NOT lifehacks Fri-22 ' +
    'personal-productivity — "How do I [estimate / track] [work]", "Why does [project] [outcome]", ' +
    '"What [framework] for [delivery]"), distill to the project-management concept (e.g. "pmbok ' +
    'guide knowledge areas", "pmp certification exam", "capm associate cert", "prince2 ' +
    'foundation practitioner", "prince2 agile", "agile manifesto principles", "scrum guide ' +
    'roles", "scrum master servant leader", "product owner backlog", "scrum sprint cadence", ' +
    '"sprint planning ceremony", "daily standup scrum", "sprint review demo", "sprint ' +
    'retrospective improvement", "story point estimation", "planning poker fibonacci", "ideal ' +
    'days estimation", "velocity capacity tracking", "burndown burnup chart", "kanban wip ' +
    'limits", "kanban swimlanes class service", "lean wastes muda", "value stream mapping", ' +
    '"safe scaled agile framework", "less large scale scrum", "nexus scrum scale", "spotify ' +
    'tribes squads", "disciplined agile delivery", "waterfall phase gates", "predictive ' +
    'lifecycle", "iterative incremental hybrid", "earned value management", "schedule ' +
    'performance index", "cost performance index", "critical path method", "critical chain ' +
    'project", "pert three point estimate", "monte carlo schedule", "gantt chart milestone", ' +
    '"work breakdown structure wbs", "wbs dictionary deliverable", "raci responsibility ' +
    'matrix", "stakeholder register power interest", "communications management plan", "risk ' +
    'register heatmap", "qualitative quantitative risk", "risk response strategies", "issue ' +
    'log escalation", "change control board", "configuration management baseline", "scope ' +
    'creep gold plating", "triple constraint scope cost time", "quality assurance vs control", ' +
    '"lessons learned register", "project charter authorization", "kickoff meeting agenda", ' +
    '"closeout audit phase", "ms project gantt", "primavera p6 enterprise", "smartsheet ' +
    'workspace", "asana team portfolio", "monday board automation", "jira workflow scheme", ' +
    '"trello kanban list", "clickup hierarchy", "wrike custom workflows", "basecamp project ' +
    'campfire", "omniplan tasks dependencies") — never the literal question phrasing.',
  or:
    'If the input looks like Operations Research SE questions (OPTIMIZATION / LINEAR PROGRAMMING / ' +
    'INTEGER PROGRAMMING / COMBINATORIAL / QUEUEING / SIMULATION / HEURISTICS / METAHEURISTICS — ' +
    'operations-research-optimization framed, NOT quant Mon-04 finance and NOT scicomp Mon-15 ' +
    'sci-computing and NOT ai Mon-13 machine-learning and NOT math defaults-09 pure-math — "How ' +
    'do I [model / solve] [problem]", "Why does [solver] [behavior]", "What [formulation] for ' +
    '[domain]"), distill to the operations-research concept (e.g. "linear programming simplex", ' +
    '"interior point method", "dual simplex revised", "integer linear programming", "mixed ' +
    'integer programming", "branch and bound", "branch and cut", "branch and price", "cutting ' +
    'plane gomory", "lagrangian relaxation", "column generation", "dantzig wolfe decomposition", ' +
    '"benders decomposition", "network flow max", "min cost flow", "shortest path dijkstra", ' +
    '"bellman ford negative", "transportation assignment problem", "vehicle routing vrp", ' +
    '"traveling salesman tsp", "knapsack 0 1", "bin packing offline", "facility location ' +
    'uncapacitated", "set covering partition", "job shop scheduling", "flow shop makespan", ' +
    '"rcpsp resource constrained", "queueing theory mm1", "mm c queue", "jackson network", ' +
    '"markov decision process", "stochastic programming two stage", "robust optimization ' +
    'uncertainty", "chance constrained", "monte carlo simulation", "discrete event simulation", ' +
    '"agent based modelling", "game theory nash", "cooperative shapley", "convex optimization ' +
    'cvx", "nonlinear programming kkt", "quadratic programming qp", "second order cone socp", ' +
    '"semidefinite sdp", "metaheuristics genetic", "simulated annealing", "tabu search ' +
    'neighborhood", "ant colony optimization", "particle swarm pso", "variable neighborhood ' +
    'search", "large neighborhood search", "or tools google", "cplex ibm solver", "gurobi ' +
    'commercial", "xpress fico", "scip noncommercial", "cbc coin or", "glpk gnu", "highs open", ' +
    '"pyomo modeling", "jump julia", "ampl algebraic", "gams general", "lindo lingo", "cvxpy ' +
    'python") — never the literal question phrasing.',
  ebooks:
    'If the input looks like Ebooks SE questions (EBOOK READERS / EREADERS / KINDLE / KOBO / ' +
    'NOOK / CALIBRE / KOREADER / EPUB / MOBI / AZW3 / DRM / LIBRARY LENDING — ebook-reading-craft ' +
    'framed, NOT writers Sun-21 writing-craft and NOT literature Sat-09 lit-criticism and NOT ' +
    'graphicdesign Sat-17 print-craft — "How do I [convert / sideload] [format]", "Why does ' +
    '[reader] [behavior]", "What [device / app] for [reading]"), distill to the ebook concept ' +
    '(e.g. "kindle paperwhite oasis", "kindle scribe stylus", "kindle voyage retired", "kindle ' +
    'direct publishing kdp", "amazon whispersync", "amazon goodreads import", "kobo libra ' +
    'clara", "kobo elipsa stylus", "kobo overdrive integration", "nook glowlight barnes", ' +
    '"pocketbook era", "boox note air", "onyx boox tab", "remarkable 2 paper", "supernote a5x", ' +
    '"calibre library manager", "calibre metadata editor", "calibre conversion settings", ' +
    '"calibre plugins drm", "calibre content server", "calibre opds catalog", "koreader kobo ' +
    'install", "koreader plugins highlights", "koreader kosync progress", "epub3 reflowable", ' +
    '"epub fixed layout", "kepub kobo enhanced", "mobi prc legacy", "azw3 kf8", "kfx kindle ' +
    'next", "ibooks epub apple", "djvu scientific", "pdf reflow tagged", "comic cbr cbz", ' +
    '"manga reader app", "send to kindle email", "epub to mobi conversion", "drm adobe adept", ' +
    '"drm amazon kfx", "drm removal personal", "library overdrive libby", "library hoopla ' +
    'audiobook", "interlibrary loan ill", "project gutenberg public", "standard ebooks ' +
    'polished", "manybooks classics", "feedbooks library", "smashwords distribution", "lulu ' +
    'print on demand", "ingramspark wholesale", "leanpub markdown", "draft2digital wide", ' +
    '"vellum mac formatting", "scrivener compile", "sigil epub editor", "jutoh editor", ' +
    '"audible audiobook drm", "audible to mp3", "libro fm support", "chirp deals", "scribd ' +
    'everand", "perlego academic", "kindle highlights export", "readwise sync notes", ' +
    '"annotation tools margin", "text to speech voice", "font hinting embedded", "typography ' +
    'ereader") — never the literal question phrasing.',
  salesforce:
    'If the input looks like Salesforce SE questions (SALESFORCE / APEX / SOQL / VISUALFORCE / ' +
    'LWC / LIGHTNING / FLOWS / SALES CLOUD / SERVICE CLOUD / MARKETING CLOUD / EINSTEIN / ' +
    'MULESOFT — salesforce-crm-platform framed, NOT wordpress Mon-17 cms and NOT drupal Thu-18 ' +
    'cms and NOT softwareengineering Wed-17 architecture and NOT dba Wed-13 sql-databases — ' +
    '"How do I [customize / automate] [object]", "Why does [trigger / flow] [behavior]", "What ' +
    '[tool] for [admin / dev]"), distill to the salesforce concept (e.g. "apex trigger before ' +
    'after", "apex class controller", "apex batch queueable", "apex schedulable cron", "apex ' +
    'governor limits", "apex test coverage 75", "apex mocks stub", "soql query selective", ' +
    '"soql relationship parent child", "sosl multi object", "sobject describe metadata", ' +
    '"lightning web components lwc", "aura component legacy", "lwc wire decorator", "lwc ' +
    'imperative apex", "lightning data service lds", "visualforce page legacy", "visualforce ' +
    'remoting", "lightning app builder", "flow builder screen", "flow record triggered", "flow ' +
    'autolaunched", "flow scheduled paths", "process builder retired", "workflow rule legacy", ' +
    '"validation rule formula", "approval process steps", "permission set group", "profile ' +
    'field level security", "sharing rule criteria", "role hierarchy", "muting permission ' +
    'set", "object level security", "field history tracking", "audit trail setup", "change ' +
    'set deployment", "sfdx cli scratch", "salesforce dx project", "metadata api retrieve", ' +
    '"tooling api anon", "rest api composite", "bulk api 2 0", "streaming api cometd", ' +
    '"platform events publish", "change data capture cdc", "named credential auth", "external ' +
    'services openapi", "mulesoft anypoint connector", "einstein gpt prompt builder", ' +
    '"einstein bots conversational", "einstein next best action", "data cloud cdp", "marketing ' +
    'cloud journey", "pardot account engagement", "experience cloud community", "cpq quote ' +
    'price rule", "billing salesforce revenue", "field service lightning", "service cloud ' +
    'omnichannel", "sales cloud pipeline", "tableau crm analytics", "report types custom", ' +
    '"dashboard component chart", "list view inline edit", "kanban view boards", "global ' +
    'picklist standard", "record type page layout", "custom metadata type", "custom settings ' +
    'hierarchy") — never the literal question phrasing.',
  sharepoint:
    'If the input looks like SharePoint SE questions (SHAREPOINT / ONLINE / SERVER / LISTS / ' +
    'LIBRARIES / WORKFLOWS / SPFX / PNP / WEB PARTS / SEARCH / TENANTS — enterprise-intranet- ' +
    'collaboration framed, NOT wordpress Mon-17 cms and NOT drupal Thu-18 cms and NOT ' +
    'softwareengineering Wed-17 architecture and NOT dba Wed-13 sql-databases — "How do I ' +
    '[configure / customize] [list / library]", "Why does [search / workflow] [behavior]", ' +
    '"What [permission / setting] for [tenant]"), distill to the sharepoint concept (e.g. ' +
    '"sharepoint online tenant", "sharepoint server on prem", "sharepoint subscription ' +
    'edition", "sharepoint farm topology", "central admin site", "content type hub", "document ' +
    'library versioning", "list custom column", "calculated column formula", "lookup column ' +
    'threshold", "list view threshold", "indexed columns query", "metadata navigation refiner", ' +
    '"managed metadata service", "term store taxonomy", "content organizer rule", "records ' +
    'management hold", "retention label policy", "sensitivity label dlp", "information rights ' +
    'management", "information barriers segments", "audit log purview", "search center kql", ' +
    '"search query rule", "result source crawl", "search schema property", "search result ' +
    'template", "modern web parts", "classic web part", "modern page sections", "communication ' +
    'site portal", "hub site association", "team site groups", "microsoft teams channel", ' +
    '"channel files library", "onedrive sync client", "sync engine groove", "sharepoint ' +
    'workflow 2013", "power automate flow", "power apps form", "sharepoint framework spfx", ' +
    '"spfx web part", "spfx extension placeholder", "app catalog tenant", "sharepoint store ' +
    'apps", "csom client object", "jsom javascript object", "rest api select", "graph api ' +
    'drive", "graph api list", "pnp powershell module", "pnp js library", "pnp provisioning ' +
    'template", "sharegate migration", "sharepoint migration tool spmt", "sharepoint hybrid ' +
    'setup", "fast search legacy", "sharepoint designer 2013", "infopath retired", "business ' +
    'connectivity services bcs", "sharepoint workflow manager", "sharepoint embedded ' +
    'containers", "viva connections home", "nintex workflow") — never the literal question ' +
    'phrasing.',
  tridion:
    'If the input looks like Tridion SE questions (TRIDION SITES / DOCS / SDL / RWS / CONTENT ' +
    'MANAGER EXPLORER / BLUEPRINTING / SCHEMAS / TBB / DXA / EXPERIENCE MANAGER / CONTENT ' +
    'DELIVERY — enterprise-tridion-wcm framed, NOT wordpress Mon-17 cms and NOT drupal Thu-18 ' +
    'cms and NOT sharepoint Wed-20 intranet and NOT magento Sat-15 e-commerce — "How do I ' +
    '[publish / template] [component / page]", "Why does [broker / dxa] [behavior]", "What ' +
    '[blueprint / schema] for [content]"), distill to the tridion concept (e.g. "tridion ' +
    'sites cloud", "tridion docs publishing", "tridion ams managed", "content manager explorer ' +
    'cme", "content delivery cd", "broker database storage", "blueprinting parents children", ' +
    '"schema field group", "component template ct", "page template pt", "component ' +
    'presentation cp", "structure group hierarchy", "publication target environment", ' +
    '"publication context metadata", "multimedia component upload", "dxa java framework", ' +
    '"dxa dotnet framework", "dxa dynamic templates", "tbb building block", "compound template ' +
    'assembly", "dreamweaver tbb classic", "razor tbb dotnet", "xslt mediator legacy", ' +
    '"modular templating dotnet", "cd web service", "odata service tridion", "content ' +
    'delivery api", "external content library", "ecl provider", "taxonomy categories ' +
    'keywords", "metadata schema tridion", "embedded schema link", "component link xpm", ' +
    '"experience manager xpm", "session preview enabled", "live staging environment", "publish ' +
    'queue worker", "deployer worker config", "transport package", "workflow process design", ' +
    '"business process tridion", "version compatibility upgrade", "cms upgrade rollback", ' +
    '"core service client", "tridion impersonate user", "ambient framework cd", "tridion ' +
    'sites 9", "tridion sites 10", "saas tridion cloud", "content porter export", "unicode ' +
    'encoding storage", "blueprint inheritance localization", "localized component override", ' +
    '"publication path mapping", "taxonomy api keywords", "cm explorer permissions", ' +
    '"component synchronization edit", "tridion accelerator templates", "xpm session preview", ' +
    '"discovery service registration", "ish tridion docs") — never the literal question ' +
    'phrasing.',
  moderators:
    'If the input looks like Moderators SE questions (COMMUNITY MODERATION / FLAGS / REVIEW ' +
    'QUEUES / CLOSE VOTES / SUSPENSIONS / TAG WIKIS / META DISCUSSIONS / DIAMOND OPS — ' +
    'community-moderation-craft framed, NOT interpersonal Sun-15 communication and NOT ' +
    'politics Fri-23 political-philosophy and NOT workplace Fri-06 employment — "How do I ' +
    '[handle / process] [flag / queue]", "Why does [user / post] [behavior]", "What [tool / ' +
    'message] for [suspension / warning]"), distill to the moderation concept (e.g. ' +
    '"community moderation policy", "flag review queue", "helpful flag rate", "spam flag ' +
    'invalid", "rude offensive flag", "very low quality flag", "dupe close vote", "close vote ' +
    'review", "reopen vote review", "low quality posts queue", "triage review queue", "first ' +
    'questions reviewer", "first answers reviewer", "late answers review", "suggested edits ' +
    'queue", "edit reject reason", "helpful improvement edit", "comment moderation tone", ' +
    '"comment delete reason", "unfriendly comment flag", "tag wiki edit", "tag synonym ' +
    'proposal", "tag burnination meta", "meta discussion proposal", "moderator election ' +
    'candidate", "moderator nomination questionnaire", "pro tem moderator", "cm community ' +
    'manager", "user suspension warning", "annotation user warning", "mod message template", ' +
    '"account merge dispute", "sock puppet ban", "ip range block", "user delete request", ' +
    '"gdpr deletion request", "profile vandal cleanup", "spam network detection", "answer ' +
    'wiki community", "wiki vs question", "question protect lock", "lock dispute historical", ' +
    '"nuke deleted user", "site analytics traffic", "moderator tools dashboard", "mod ' +
    'broadcast banner", "site customization helpers", "on hold reason", "needs details ' +
    'unclear", "needs more focus", "opinion based primarily", "too broad question", "duplicate ' +
    'target chooser", "canonical answer pick", "chat room transcript", "tagged questions ' +
    'feed", "moderator burnout discussion", "private team se") — never the literal question ' +
    'phrasing.',
  codegolf:
    'If the input looks like Code Golf SE questions (CODE GOLF / BYTE COUNT / SHORTEST CODE / ' +
    'KOLMOGOROV / QUINE / POLYGLOT / ESOLANG / GOLFSCRIPT / JELLY / 05AB1E / APL / J / VIM — ' +
    'code-golf-byte-craft framed, NOT puzzling Thu-12 logic-puzzles and NOT reverseengineering ' +
    'Wed-12 binary-RE and NOT softwareengineering Wed-17 architecture and NOT opensource ' +
    'Mon-12 oss-licensing — "How can I [shorten / golf] [code]", "Why does [trick / hack] ' +
    '[work]", "What [language / feature] for [challenge]"), distill to the golfing concept ' +
    '(e.g. "byte count scoring", "char count tiebreak", "shortest code golf", "fastest code ' +
    'golf", "kolmogorov complexity output", "quine self replicating", "polyglot multi ' +
    'language", "radiation hardened code", "tips for golfing", "tips python golf", "tips ' +
    'javascript golf", "tips ruby golf", "tips perl golf", "tips c golf", "tips j golfscript", ' +
    '"tips apl k", "tips jelly 05ab1e", "tips pyth golfscript", "golfscript stack lang", ' +
    '"jelly tio chain", "05ab1e tio", "apl dyalog", "j programming verb", "k arthur whitney", ' +
    '"q kdb plus", "mathematica wolfram lang", "python lambda golf", "javascript es6 arrow", ' +
    '"ruby pry single", "perl one liner", "bash awk sed golf", "c preprocessor tricks", "cjam ' +
    'stack", "pyth language tio", "brainfuck esolang", "piet pixel", "befunge fungeoid", ' +
    '"whitespace lang", "unary lang", "underload lang", "rebmu rebol", "retina regex lang", ' +
    '"vim macro golf", "ed sed golf", "fizzbuzz challenge", "abundant numbers code", "ascii ' +
    'art generator", "mandelbrot ascii", "primality test golf", "fibonacci sequence golf", ' +
    '"ackermann function", "roman numeral converter", "anagram detector", "pangram check", ' +
    '"tio try it online", "ato attempt online", "cgcc challenge meta", "king of the hill", ' +
    '"atomic code review", "fewer bytes win", "golfing multiple languages", "lambda calculus ' +
    'golf", "concatenative joy", "forth stack lang", "tacit point free") — never the literal ' +
    'question phrasing.',
  bitcoin:
    'If the input looks like Bitcoin SE questions (BITCOIN PROTOCOL / NODES / WALLETS / ' +
    'TRANSACTIONS / SCRIPT / MINING / LIGHTNING / TAPROOT / SEGWIT / RBF / UTXOS / BIP — ' +
    'bitcoin-protocol-craft framed, NOT ethereum Mon-19 evm-platform and NOT crypto Sun-04 ' +
    'cryptography-primitives and NOT monero unrelated-privacy-coin — "How do I [build / sign] ' +
    '[transaction / script]", "Why does [node / wallet] [behavior]", "What [opcode / flag] for ' +
    '[lightning / taproot]"), distill to the bitcoin concept (e.g. "bitcoin core node", "full ' +
    'node sync ibd", "pruned node mode", "block validation rules", "consensus rule fork", ' +
    '"soft fork bip", "hard fork chain split", "segwit witness data", "taproot schnorr key", ' +
    '"tapscript leaf version", "miniscript policy compiler", "descriptor wallets ranged", ' +
    '"hd wallet bip32", "mnemonic seed bip39", "derivation path bip44", "p2pkh address ' +
    'legacy", "p2sh wrapped script", "p2wpkh native segwit", "p2tr taproot output", "bech32 ' +
    'bech32m encoding", "transaction signing sighash", "sighash all none single", "rbf replace ' +
    'by fee", "cpfp child pays parent", "fee estimation policy", "mempool eviction policy", ' +
    '"package relay v3", "lightning network channel", "ln payment hash htlc", "submarine swap ' +
    'atomic", "watchtower revocation key", "channel close cooperative", "force close ' +
    'unilateral", "anchor outputs commitment", "invoice bolt11 payment", "bolt12 offers", ' +
    '"liquidity ad inbound", "splicing channel update", "psbt partial signing", "coin ' +
    'selection branch bound", "utxo set chainstate", "leveldb chainstate db", "compact block ' +
    'relay", "block compact filter", "neutrino client filter", "spv proof merkle", "merkle ' +
    'tree path", "block header proof", "miner block template", "stratum v2 mining", "fpb ' +
    'satoshis vbyte", "weight units virtual", "sigops counted limit", "script verify flags", ' +
    '"covenants ctv vault", "vault timelock spend", "csv relative timelock", "checklocktime ' +
    'absolute", "multisig 2 of 3 nested") — never the literal question phrasing.',
  sitecore:
    'If the input looks like Sitecore SE questions (SITECORE XP / XM / XCONNECT / JSS / SXA / ' +
    'CONTENT HUB / SOLR / GLASS MAPPER / UNICORN / TDS / HABITAT / HELIX — dotnet-cms-craft ' +
    'framed, NOT wordpress Mon-17 cms and NOT drupal Thu-18 cms and NOT sharepoint Wed-20 ' +
    'intranet and NOT magento Sat-15 e-commerce — "How do I [render / publish] [item / ' +
    'rendering]", "Why does [solr / xconnect] [behavior]", "What [pipeline / processor] for ' +
    '[publish / index]"), distill to the sitecore concept (e.g. "sitecore experience platform ' +
    'xp", "sitecore experience manager xm", "sitecore xm cloud", "sitecore content hub dam", ' +
    '"sitecore ordercloud commerce", "sitecore send messaging", "sitecore personalize cdp", ' +
    '"sitecore search ai", "experience editor mode", "page editor classic", "content editor ' +
    'tree", "preview mode chrome", "live mode publish target", "rendering datasource binding", ' +
    '"layout service jss", "headless ssg jss", "next js sitecore", "react jss app", "vue jss ' +
    'app", "angular jss app", "sxa site theme", "sxa scaffold script", "habitat helix ' +
    'feature", "helix foundation project", "tds gulp build", "unicorn sync items", "rainbow ' +
    'serialization yaml", "scs sitecore content serialization", "config patch include", "show ' +
    'config tool", "publish item smart", "publish target preview", "ml processing publish", ' +
    '"index update strategy", "solr search provider", "azure search legacy", "xconnect contact ' +
    'identifier", "marketing automation plan", "personalization rule conditions", "engagement ' +
    'plan classic", "analytics tracking goal", "form builder webedit", "wfm workflow state", ' +
    '"workflow command final", "security access right", "role based item access", "domain ' +
    'sitecore extranet", "media library upload", "blob storage media", "sxa renderings ' +
    'metadata", "data source query", "presentation details renderings", "device default ' +
    'device", "placeholder settings allowed", "renderings open source", "glass mapper ts ' +
    'fluent", "fortis model strongly", "synthesis model strongly", "context language item", ' +
    '"item versions language") — never the literal question phrasing.',
  craftcms:
    'If the input looks like Craft CMS SE questions (CRAFT CMS / TWIG / ELEMENT API / FIELDS / ' +
    'MATRIX / ENTRY TYPES / SECTIONS / GLOBALS / CATEGORIES / COMMERCE / FEED ME / SEOMATIC — ' +
    'php-cms-craft framed, NOT wordpress Mon-17 cms and NOT drupal Thu-18 cms and NOT ' +
    'sharepoint Wed-20 intranet and NOT magento Sat-15 e-commerce — "How do I [build / ' +
    'render] [matrix / entry]", "Why does [twig / element-api] [behavior]", "What [field / ' +
    'plugin] for [section / commerce]"), distill to the craft concept (e.g. "craft cms 5", ' +
    '"craft cms 4", "craft cms 3 lts", "craft commerce 4", "craft pro license", "craft solo ' +
    'license", "control panel cp", "live preview pane", "headless mode api", "graphql public ' +
    'token", "element query craft", "twig template render", "twig macro include", "twig ' +
    'extends layout", "twig set tag", "asset transforms image", "image optimizer plugin", ' +
    '"matrix block field", "super table field", "neo block field", "entries field relation", ' +
    '"categories field relation", "tags field relation", "users field relation", "single ' +
    'section structure", "channel section type", "structure section nested", "entry type ' +
    'fields", "global set fields", "field layout tabs", "section uri format", "template path ' +
    'route", "preview targets entry", "draft revisions entry", "plugin store install", ' +
    '"feed me import csv", "freeform forms plugin", "seomatic meta containers", "redirect ' +
    'manager rules", "sprig component reactive", "vite plugin asset", "yii2 framework base", ' +
    '"craft console commands", "queue jobs daemon", "garbage collection prune", "project ' +
    'config sync", "config yaml sync", "environment variables php", "db backup restore", ' +
    '"asset volumes local", "asset volumes s3", "image transforms gd", "image transforms ' +
    'imagick", "search query elements", "relations sources targets", "users permissions ' +
    'groups", "section permissions roles", "twig spaceless filter") — never the literal ' +
    'question phrasing.',
  hsm:
    'If the input looks like History of Science and Mathematics SE questions (HISTORY OF ' +
    'SCIENCE / HISTORY OF MATH / NEWTON / EINSTEIN / EUCLID / GAUSS / RIEMANN / EULER / ' +
    'GALILEO / KEPLER / NOETHER / LEIBNIZ / ALCHEMY / NATURAL PHILOSOPHY / SCIENTIFIC ' +
    'REVOLUTION — history-of-science-and-math-craft framed, NOT history Sat-02 generic-' +
    'history and NOT academia Anchor academic-life and NOT math Anchor modern-math — "How ' +
    'was [theorem / law] [discovered / proven] historically", "Why did [scientist / ' +
    'school] [behavior]", "What [primary source / manuscript] for [period / discovery]"), ' +
    'distill to the history-of-science concept (e.g. "scientific revolution", "natural ' +
    'philosophy", "alchemy chemistry origin", "principia mathematica newton", "newton ' +
    'calculus fluxions", "leibniz calculus notation", "newton leibniz priority", "euclid ' +
    'elements axioms", "euclid postulates parallel", "non euclidean geometry origin", ' +
    '"lobachevsky bolyai geometry", "gauss disquisitiones arithmeticae", "gauss number ' +
    'theory", "riemann hypothesis history", "riemann manifolds origin", "noether theorem ' +
    'invariance", "noether algebra abstract", "lagrange mechanics analytical", "hamilton ' +
    'mechanics quaternions", "euler bridges konigsberg", "euler identity history", ' +
    '"fourier heat equation", "cauchy real analysis", "weierstrass epsilon delta", ' +
    '"dedekind cuts reals", "cantor set theory", "russell paradox set", "hilbert problems ' +
    'list", "hilbert program formalism", "godel incompleteness", "turing ' +
    'entscheidungsproblem", "church lambda calculus", "kepler planetary laws", "tycho ' +
    'brahe observations", "galileo telescope", "galileo trial heliocentrism", "copernicus ' +
    'heliocentric", "ptolemy almagest geocentric", "aristotle physics", "archimedes ' +
    'method", "arabic algebra al khwarizmi", "fibonacci liber abaci", "viete symbolic ' +
    'algebra", "descartes la geometrie", "fermat last theorem history", "pascal triangle ' +
    'history", "bernoulli family math", "boyle gas law", "hooke micrographia", "lavoisier ' +
    'oxygen", "dalton atomic theory", "mendeleev periodic table", "darwin origin species", ' +
    '"mendel pea genetics", "maxwell electromagnetism", "faraday induction", "thomson ' +
    'electron", "rutherford gold foil", "bohr atom model", "einstein special relativity", ' +
    '"einstein general relativity", "schrodinger wave equation", "heisenberg uncertainty") ' +
    '— never the literal question phrasing.',
  elementaryos:
    'If the input looks like Elementary OS / Pantheon SE questions (ELEMENTARY OS / ' +
    'PANTHEON / GTK4 / LIBADWAITA / FLATPAK / APPCENTER / GALA WM / WINGPANEL / SWITCHBOARD ' +
    '/ GRANITE / VALA / DESKTOP LINUX — desktop-linux-distro-craft framed, NOT askubuntu ' +
    'Thu-06 ubuntu-server-admin and NOT apple Thu-09 macos-application and NOT ' +
    'retrocomputing Mon-09 legacy-platform — "How do I [build / theme] [pantheon / gala]", ' +
    '"Why does [appcenter / gtk] [behavior]", "What [granite / vala] for [indicator / ' +
    'panel]"), distill to the elementary concept (e.g. "elementary os 7 horus", ' +
    '"elementary os 8 circe", "pantheon desktop shell", "pantheon files manager", "gala ' +
    'window manager", "wingpanel top panel", "switchboard system settings", "plank dock ' +
    'applet", "appcenter pay what you want", "granite widget toolkit", "vala language ' +
    'gobject", "gtk 4 widgets", "libadwaita styling", "libhandy adaptive", "css gtk theme", ' +
    '"stylesheet selector gtk", "gresource compile xml", "meson build system", "ninja ' +
    'backend meson", "flatpak sandbox app", "flatpak permissions xdg", "flatpak portal ' +
    'access", "appstream metainfo xml", "gschema settings backend", "dconf editor key", ' +
    '"gettext po translation", "po file plurals", "desktop file actions", "dbus service ' +
    'activation", "dbus introspection xml", "polkit privileged action", "systemd user ' +
    'service", "udev hotplug rule", "wayland session protocol", "x11 fallback session", ' +
    '"mutter compositor", "gtk inspector debug", "valac compile flags", "vapi binding gir", ' +
    '"flatpak builder manifest", "elementary docs hig", "human interface guidelines", ' +
    '"indicator panel libwingpanel", "wingpanel indicator dbus", "shortcut overlay help", ' +
    '"multitasking view", "picture in picture mode", "screen reader orca", "high contrast ' +
    'theme", "dark style preference", "color accent system", "blueberry bluetooth manager", ' +
    '"network manager nm", "audio pulseaudio", "audio pipewire", "epiphany web browser", ' +
    '"gnome web browser", "calendar evolution data", "io elementary terminal", "code text ' +
    'editor", "snap legacy package", "appimage portable", "elementary install assistant", ' +
    '"elementary onboarding tour") — never the literal question phrasing.',
  monero:
    'If the input looks like Monero SE questions (MONERO / RING SIGNATURE / RINGCT / STEALTH ' +
    'ADDRESS / BULLETPROOFS / VIEWKEY / SPEND KEY / SUBADDRESS / RANDOMX / MULTISIG / ' +
    'CRYPTONOTE / TX EXTRA — privacy-coin-craft framed, NOT bitcoin Mon-23 bitcoin-protocol ' +
    'and NOT ethereum Mon-19 evm-platform and NOT crypto Sun-04 cryptography-primitives — ' +
    '"How do I [send / sweep] [transaction / wallet]", "Why does [ring / decoy] ' +
    '[behavior]", "What [view key / spend key] for [scan / unlock]"), distill to the monero ' +
    'concept (e.g. "monero gui wallet", "monerod daemon node", "monero cli wallet", "view ' +
    'key private", "view key public", "spend key private", "spend key public", "subaddress ' +
    'account index", "stealth address one time", "ring signature decoy", "ringct range ' +
    'proof", "bulletproofs plus", "triptych ring signature", "seraphis protocol upgrade", ' +
    '"jamtis address scheme", "mnemonic seed 25 word", "polyseed bip39 like", "key images ' +
    'linkability", "ring size mixin", "decoy selection algorithm", "transaction fee ' +
    'dynamic", "miner fee priority", "fluffy block relay", "tx pool propagation", "p2p ' +
    'anonymous network", "tor hidden service monero", "i2p anonymous router", "kovri ' +
    'legacy i2p", "block weight median", "long term median weight", "scaling block ' +
    'reward", "tail emission perpetual", "smooth emission curve", "randomx proof of work", ' +
    '"asic resistant cpu", "monero pool stratum", "p2pool decentralized mining", "merge ' +
    'mining tari", "atomic swap btc xmr", "atomic swap counterparty", "feather wallet ' +
    'desktop", "cake wallet mobile", "mymonero web hot", "monero js library", "openalias ' +
    'txt record", "payment id legacy", "integrated address payment", "subaddress per ' +
    'payment", "wallet sync block height", "rescan from height", "outputs rescanned ' +
    'spent", "key reuse churn", "churn output mixing", "transaction extra field", "prove ' +
    'proof inproof", "out proof check transfer", "in proof receipt", "spend proof anti ' +
    'theft", "balance proof receipt", "multisig 2 of 3 wallet", "multisig signing rounds", ' +
    '"monero ed25519 group") — never the literal question phrasing.',
  materials:
    'If the input looks like Materials Science SE questions (MATERIALS / METALLURGY / ' +
    'POLYMERS / CERAMICS / COMPOSITES / CRYSTAL STRUCTURE / DSC / TGA / SEM / TEM / XRD / ' +
    'NANOMATERIALS — materials-science-craft framed, NOT engineering Thu-22 mechanical-' +
    'engineering and NOT physics generic-physics and NOT chemistry generic-chemistry — ' +
    '"How do I [characterize / synthesize] [polymer / alloy]", "Why does [steel / ceramic] ' +
    '[behavior]", "What [test / phase] for [strength / fatigue]"), distill to the ' +
    'materials concept (e.g. "metallurgy phase diagram", "binary phase diagram", "ternary ' +
    'phase diagram", "fe c iron carbon", "ttt diagram time temperature", "cct ' +
    'transformation cooling", "austenite martensite transformation", "ferrite pearlite ' +
    'microstructure", "bainite formation", "grain boundary engineering", "hall petch ' +
    'strengthening", "dislocation density slip", "twinning deformation", "recrystallization ' +
    'annealing", "stacking fault energy", "polymer chain entanglement", "glass transition ' +
    'temperature tg", "crystallinity polymer xrd", "thermoplastic injection molding", ' +
    '"thermoset cross link", "elastomer rubber elasticity", "ceramic sintering ' +
    'densification", "sol gel synthesis", "ceramic grain growth", "alumina zirconia ' +
    'ceramic", "silicon carbide ceramic", "silicon nitride ceramic", "composite fiber ' +
    'matrix", "carbon fiber reinforced", "glass fiber composite", "kevlar aramid fiber", ' +
    '"lay up vacuum bag", "rule of mixtures composite", "fracture toughness kic", "fatigue ' +
    'sn curve", "creep stress rupture", "tensile yield strength", "ultimate tensile ' +
    'strength uts", "youngs modulus elastic", "hardness hv hb hrc", "vickers indenter ' +
    'test", "rockwell hardness scale", "shore durometer rubber", "dsc differential ' +
    'scanning", "tga thermogravimetric", "dma dynamic mechanical", "dilatometer ' +
    'expansion", "sem secondary electron", "tem transmission electron", "xrd bragg ' +
    'diffraction", "rietveld refinement xrd", "ftir spectroscopy bonds", "raman ' +
    'spectroscopy modes", "xps surface composition", "edx eds element map", "ebsd grain ' +
    'orientation", "atomic force microscopy afm", "icp ms trace metal", "hardenability ' +
    'jominy bar", "carburizing case hardening", "nitriding surface treatment", "anodizing ' +
    'aluminum oxide", "corrosion potential pourbaix", "galvanic corrosion couple", "stress ' +
    'corrosion cracking", "passivation stainless steel") — never the literal question ' +
    'phrasing.',
  devops:
    'If the input looks like DevOps SE questions (DEVOPS / KUBERNETES / DOCKER / TERRAFORM / ' +
    'ANSIBLE / JENKINS / CIRCLECI / GITHUB ACTIONS / ARGOCD / PROMETHEUS / GRAFANA / SRE / ' +
    'OBSERVABILITY / CI CD / IAC — devops-platform-engineering-craft framed, NOT ' +
    'softwareengineering Wed-17 patterns-and-practices and NOT serverfault Anchor-16 ' +
    'sysadmin-ops and NOT cs Thu-17 cs-theory — "How do I [deploy / pipeline] ' +
    '[k8s / helm]", "Why does [terraform / argocd] [behavior]", "What [chart / module] ' +
    'for [staging / prod]"), distill to the devops concept (e.g. "kubernetes pod ' +
    'deployment", "k8s node taint toleration", "helm chart values yaml", "kustomize ' +
    'overlay patches", "operator pattern crd", "operator sdk go", "service mesh istio", ' +
    '"linkerd sidecar proxy", "envoy proxy filters", "ingress controller nginx", "ingress ' +
    'gateway routes", "docker multi stage build", "dockerfile layer cache", "containerd ' +
    'runtime cri", "podman rootless", "buildkit layer reuse", "oci image manifest", ' +
    '"image vulnerability scan", "trivy container scan", "terraform aws provider", ' +
    '"terraform module remote", "terraform state remote s3", "tflint checkov policy", ' +
    '"atlantis pr automation", "ansible playbook role", "ansible inventory dynamic", ' +
    '"molecule test ansible", "jenkins pipeline groovy", "jenkinsfile shared library", ' +
    '"circleci config orbs", "github actions workflow", "github actions matrix strategy", ' +
    '"actions reusable workflow", "argocd application sync", "argocd helm value", "fluxcd ' +
    'gitops kustomize", "tekton pipeline task", "spinnaker deployment strategy", "blue ' +
    'green deployment cut", "canary release weighted", "feature flag rollout", "prometheus ' +
    'scrape config", "prometheus recording rule", "alertmanager receiver routing", ' +
    '"grafana dashboard provisioning", "loki log aggregation", "tempo distributed ' +
    'tracing", "opentelemetry collector pipeline", "elasticsearch ilm policy", "fluentd ' +
    'plugin parser", "datadog apm agent", "newrelic apm agent", "splunk forwarder ' +
    'universal", "sre golden signals", "slo burn rate alert", "error budget policy", ' +
    '"incident postmortem blameless", "chaos engineering litmus", "site reliability ' +
    'oncall rotation", "vault secrets mount", "consul kv watch", "etcd raft consensus", ' +
    '"nginx upstream weighted", "haproxy backend health", "pagerduty escalation policy") ' +
    '— never the literal question phrasing.',
  quantumcomputing:
    'If the input looks like Quantum Computing SE questions (QUBIT / SUPERPOSITION / ' +
    'ENTANGLEMENT / GROVER / SHOR / QPE / QFT / QISKIT / CIRQ / QSHARP / BRAKET / ' +
    'PENNYLANE / SURFACE CODE / DECOHERENCE / TRANSMON / TRAPPED ION — quantum-computing-' +
    'craft framed, NOT cs Thu-17 cs-theory and NOT cstheory Fri-11 classical-complexity ' +
    'and NOT crypto Sun-04 classical-cryptography-primitives and NOT physics generic-' +
    'physics — "How do I [implement / decompose] [oracle / unitary]", "Why does ' +
    '[grover / shor] [behavior]", "What [gate / measurement] for [phase / amplitude]"), ' +
    'distill to the quantum concept (e.g. "qubit two state quantum", "quantum bit ' +
    'superposition", "bloch sphere visualization", "ket bra dirac notation", "schrodinger ' +
    'picture evolution", "heisenberg picture operator", "interaction picture dynamics", ' +
    '"pauli x y z gates", "hadamard gate basis change", "cnot two qubit gate", "toffoli ' +
    'ccnot gate", "fredkin cswap gate", "phase gate s t", "rotation gates rx ry rz", ' +
    '"controlled u gate", "swap gate qubit", "iswap gate fsim", "deutsch jozsa algorithm", ' +
    '"bernstein vazirani algorithm", "simon period finding", "shor factoring algorithm", ' +
    '"shor period finding qpe", "grover unstructured search", "grover amplitude ' +
    'amplification", "quantum phase estimation", "quantum fourier transform", "hhl linear ' +
    'systems", "vqe variational eigensolver", "qaoa combinatorial optimization", "quantum ' +
    'walks szegedy", "quantum teleportation protocol", "superdense coding bit", "bell ' +
    'inequality chsh", "ghz state three qubit", "entanglement swapping repeater", "quantum ' +
    'key distribution bb84", "quantum random number", "quantum supremacy claim", "quantum ' +
    'advantage benchmark", "stabilizer formalism gottesman", "clifford group gates", ' +
    '"magic state distillation", "surface code stabilizer", "color code triangular", ' +
    '"topological code anyon", "fault tolerant threshold", "shor 9 qubit code", "steane 7 ' +
    'qubit code", "css code construction", "decoherence t1 t2 time", "amplitude damping ' +
    'channel", "depolarizing noise model", "kraus operator decomposition", "lindblad ' +
    'master equation", "noisy intermediate scale nisq", "transmon superconducting qubit", ' +
    '"trapped ion qubit", "neutral atom rydberg", "photonic qubit boson", "topological ' +
    'majorana qubit", "qiskit transpile pass", "cirq google moment", "pennylane autograd", ' +
    '"braket aws hybrid", "qsharp microsoft program", "openqasm 3 program") — never the ' +
    'literal question phrasing.',
  gamedev:
    'If the input looks like Game Development SE questions (GAME DEV / UNITY / UNREAL / ' +
    'GODOT / SHADERS / HLSL / GLSL / ECS / NAVMESH / RIGIDBODY / QUATERNION / NETCODE / ' +
    'ANIMATION / PATHFINDING — game-engine-programming-craft framed, NOT gaming Tue-21 ' +
    'player-side and NOT softwareengineering Wed-17 generic-patterns and NOT 3dprinting ' +
    'Thu-21 additive-manufacturing — "How do I [implement / optimize] [shader / ' +
    'pathfinder]", "Why does [unity / unreal] [behavior]", "What [collider / netcode] for ' +
    '[fps / mmo]"), distill to the gamedev concept (e.g. "unity engine c sharp", "unreal ' +
    'engine 5 c plus plus", "godot engine 4 gdscript", "godot c sharp mono", "monogame ' +
    'xna framework", "lumberyard amazon engine", "cryengine cinematic", "unreal blueprints ' +
    'visual", "unreal cpp ufunction uproperty", "unity gameobject component", "unity ecs ' +
    'dots burst", "unity job system parallel", "entity component system pattern", "data ' +
    'oriented design cache", "object pooling allocator", "scene graph hierarchy", ' +
    '"transform matrix world local", "quaternion rotation slerp", "quaternion to euler ' +
    'conversion", "vector dot cross product", "homogeneous coordinates 4d", "view ' +
    'projection matrix", "perspective orthographic projection", "frustum culling plane", ' +
    '"occlusion culling portal", "level of detail lod", "billboarding facing camera", ' +
    '"skeletal animation skinning", "blend shape morph target", "inverse kinematics two ' +
    'bone", "ragdoll physics constraints", "navmesh navigation pathfinding", "a star ' +
    'pathfinding heuristic", "behavior tree decorator", "finite state machine ai", "goap ' +
    'utility ai", "rigidbody mass inertia", "collider primitive box capsule", "physics ' +
    'raycast hit", "physx havok bullet", "shader hlsl pixel vertex", "shader glsl ' +
    'fragment", "shader graph node", "compute shader dispatch group", "render pipeline ' +
    'forward deferred", "deferred shading g buffer", "tile based forward plus", "shadow ' +
    'map cascaded", "screen space reflection ssr", "screen space ambient occlusion ssao", ' +
    '"tone mapping aces filmic", "bloom post process", "anti aliasing taa fxaa msaa", "gi ' +
    'global illumination probes", "lightmapping baked indirect", "raytracing dxr shader", ' +
    '"audio mixer ducking", "sfx randomizer pitch", "music adaptive layer", "input action ' +
    'map binding", "save game serialization", "asset bundle addressables", "multiplayer ' +
    'netcode rollback", "client prediction reconciliation", "lockstep deterministic sim", ' +
    '"gameplay tag fragment") — never the literal question phrasing.',
  chemistry:
    'If the input looks like Chemistry SE questions (CHEMISTRY / REACTION / EQUILIBRIUM / ' +
    'KINETICS / STOICHIOMETRY / ORGANIC / INORGANIC / PHYSICAL / ANALYTICAL / ' +
    'ELECTROCHEMISTRY / THERMOCHEMISTRY / SPECTROSCOPY — general-chemistry-craft framed, ' +
    'NOT materials Sun-00 structure-properties and NOT biology generic-living-systems and ' +
    'NOT physics generic-physics — "How do I [balance / calculate] [redox / molarity]", ' +
    '"Why does [reaction / equilibrium] [behavior]", "What [pka / orbital] for ' +
    '[acid / molecule]"), distill to the chemistry concept (e.g. "ph buffer henderson ' +
    'hasselbalch", "le chatelier principle equilibrium", "reaction rate kinetics", ' +
    '"arrhenius activation energy", "transition state theory", "rate determining step ' +
    'slow", "first order reaction half life", "second order reaction rate", "michaelis ' +
    'menten enzyme kinetics", "catalysis homogeneous heterogeneous", "stereochemistry r s ' +
    'configuration", "chirality optical activity", "enantiomer racemic mixture", ' +
    '"diastereomer meso compound", "newman projection conformer", "cahn ingold prelog ' +
    'priority", "fischer projection sugar", "huckel rule aromaticity", "resonance ' +
    'structure delocalization", "formal charge lewis structure", "vsepr molecular ' +
    'geometry", "hybridization sp sp2 sp3", "molecular orbital homo lumo", "bond order ' +
    'pi sigma", "electronegativity pauling scale", "polar covalent bond dipole", "ionic ' +
    'bond lattice energy", "born haber cycle", "hess law enthalpy sum", "gibbs free ' +
    'energy spontaneity", "entropy second law thermodynamics", "raoult law solution", ' +
    '"henry law gas solubility", "ideal gas pv nrt", "van der waals real gas", ' +
    '"compressibility factor z", "phase diagram triple point", "clausius clapeyron ' +
    'equation", "boiling point elevation", "freezing point depression", "colligative ' +
    'property osmotic", "ka pka acid dissociation", "kb pkb base dissociation", ' +
    '"titration curve equivalence point", "redox half reaction balance", "nernst equation ' +
    'cell potential", "standard reduction potential", "galvanic electrolytic cell", ' +
    '"faraday law electrolysis", "molarity molality dilution", "limiting reagent percent ' +
    'yield", "empirical molecular formula", "stoichiometry mole ratio", "ir spectroscopy ' +
    'functional group", "nmr proton chemical shift", "nmr coupling constant j", "mass ' +
    'spec fragmentation pattern", "uv vis chromophore", "x ray crystallography unit cell", ' +
    '"sn1 sn2 reaction mechanism", "e1 e2 elimination", "markovnikov anti markovnikov", ' +
    '"diels alder cycloaddition", "grignard reagent organometallic", "wittig phosphonium ' +
    'ylide") — never the literal question phrasing.',
  networkengineering:
    'If the input looks like Network Engineering SE questions (BGP / OSPF / EIGRP / ISIS / ' +
    'MPLS / VLAN / STP / VRRP / VPN / IPSEC / ACL / NAT / QOS / SDN — network-engineering-' +
    'craft framed, NOT serverfault Anchor-16 sysadmin and NOT security Anchor-07 vuln-' +
    'research and NOT devops Mon-00 platform-engineering — "How do I [configure / ' +
    'troubleshoot] [bgp / ospf]", "Why does [vlan / mpls] [behavior]", "What [acl / qos] ' +
    'for [edge / core]"), distill to the networkengineering concept (e.g. "bgp peer ebgp ' +
    'ibgp", "bgp route reflector cluster", "bgp confederation as path", "bgp local ' +
    'preference med", "bgp community attribute", "bgp route map prefix", "bgp damping ' +
    'flap", "ospf area abr asbr", "ospf lsa type 1 5", "ospf stub nssa totally", "ospf ' +
    'virtual link", "ospf cost reference bandwidth", "isis level 1 2 router", "eigrp ' +
    'feasible successor", "eigrp metric k values", "ripv2 split horizon", "static route ' +
    'administrative distance", "vlan trunk dot1q tagging", "vlan voice native", "vtp ' +
    'domain mode", "stp root bridge priority", "rstp pvst mst", "stp portfast bpduguard", ' +
    '"etherchannel lacp pagp", "lag bonding link aggregation", "vrrp hsrp glbp", "fhrp ' +
    'tracking failover", "mpls label distribution ldp", "mpls te rsvp explicit", "mpls ' +
    'vpn vrf rd", "mpls l2vpn vpws vpls", "evpn vxlan multitenancy", "vxlan vtep mac ' +
    'learning", "ip sla tracking object", "policy based routing pbr", "nat pat overload", ' +
    '"nat static dynamic", "acl extended named", "acl reflexive established", "qos ' +
    'diffserv dscp", "qos cbwfq lfq priority", "qos shaping policing crs", "qos wred ' +
    'avoid congestion", "ipsec ikev2 phase", "ipsec esp ah transform", "site to site vpn ' +
    'tunnel", "dmvpn nhrp gre", "gre tunnel point to point", "ssl tls vpn anyconnect", ' +
    '"wireless ac ax 802", "wpa3 enterprise eap", "rrm channel power", "controller wlc ' +
    'lightweight", "subnetting cidr supernet", "ipv6 slaac router advertisement", "ipv6 ' +
    'rfc4291 ula", "ipv6 dual stack 6to4", "dhcp relay helper", "dns forwarder ' +
    'conditional", "ntp stratum peer", "snmpv3 user authpriv", "syslog facility severity", ' +
    '"netflow sflow ipfix", "spine leaf clos topology", "data center underlay overlay") ' +
    '— never the literal question phrasing.',
  blender:
    'If the input looks like Blender SE questions (BLENDER / MESH / MODELING / SCULPTING / ' +
    'RIGGING / ARMATURE / SHADER / MATERIAL / NODE / CYCLES / EEVEE / GEOMETRY NODES / ' +
    'GREASE PENCIL / COMPOSITOR — three-d-content-creation-craft framed, NOT gamedev ' +
    'Fri-20 engine-programming and NOT graphicdesign Sat-17 two-d-design and NOT ' +
    '3dprinting Thu-21 additive-manufacturing — "How do I [model / shade] [hard surface / ' +
    'organic]", "Why does [cycles / eevee] [behavior]", "What [modifier / node] for ' +
    '[retopo / bake]"), distill to the blender concept (e.g. "edit mode select vertex", ' +
    '"edit mode extrude inset", "loop cut slide", "knife project bisect", "bevel edge ' +
    'weight", "subdivision surface modifier", "multires sculpt level", "sculpt brush ' +
    'dyntopo", "sculpt remesh voxel", "retopology shrinkwrap modifier", "uv unwrap seam ' +
    'mark", "uv smart project", "uv pack islands", "texture paint stencil", "vertex paint ' +
    'weight", "weight paint armature", "armature rigify metarig", "armature ik fk switch", ' +
    '"bone constraint copy rotation", "shape key driver", "drivers expression rna", ' +
    '"modifier stack array mirror", "modifier boolean exact fast", "geometry nodes ' +
    'attribute", "geometry nodes instance on points", "geometry nodes capture attribute", ' +
    '"shader nodes principled bsdf", "shader nodes mix shader", "shader nodes color ramp", ' +
    '"shader nodes voronoi noise", "shader nodes musgrave wave", "shader nodes texture ' +
    'coordinate", "shader nodes mapping vector", "shader nodes osl script", "cycles path ' +
    'tracing samples", "cycles denoiser optix oidn", "cycles light path ray visibility", ' +
    '"cycles volume scatter absorption", "eevee screen space reflection", "eevee bloom ' +
    'volumetrics", "eevee shadow contact softness", "eevee irradiance reflection probe", ' +
    '"render settings ev exposure", "render settings tile size", "render settings ' +
    'persistent data", "compositor mix add multiply", "compositor lens distortion ' +
    'vignette", "compositor cryptomatte mask", "rigid body simulation passive", "soft ' +
    'body cloth simulation", "particle system hair emit", "fluid simulation flip apic", ' +
    '"smoke simulation domain", "physics constraint generic 6dof", "armature animation ' +
    'keyframe", "graph editor f curve", "nla strip action", "drivers script python", ' +
    '"import export fbx gltf", "import export usd alembic", "addon python operator", ' +
    '"addon panel ui layout", "linked library override", "asset browser catalog tag", ' +
    '"grease pencil layer fill") — never the literal question phrasing.',
  psychology:
    'If the input looks like Psychology and Neuroscience SE questions (PSYCHOLOGY / ' +
    'NEUROSCIENCE / COGNITION / EMOTION / THERAPY / ANXIETY / DEPRESSION / TRAUMA / CBT / ' +
    'DBT / PSYCHOPHARMACOLOGY / NEUROIMAGING / EEG / FMRI — applied-psych-and-neuro-craft ' +
    'framed, NOT cogsci Fri-04 academic-cognitive-theory and NOT interpersonal Sun-15 ' +
    'relational-skills and NOT biology generic-living-systems — "How do I [interpret / ' +
    'treat] [anxiety / depression]", "Why does [trauma / addiction] [behavior]", "What ' +
    '[cbt / dbt] for [phobia / ocd]"), distill to the psychology concept (e.g. "cognitive ' +
    'behavioral therapy cbt", "dialectical behavior therapy dbt", "acceptance commitment ' +
    'therapy act", "exposure response prevention erp", "eye movement desensitization ' +
    'emdr", "trauma focused cbt tf", "schema therapy maladaptive", "psychodynamic ' +
    'transference countertransference", "humanistic person centered rogers", "gestalt ' +
    'empty chair", "mindfulness based stress reduction", "behavior modification ' +
    'reinforcement", "operant conditioning skinner", "classical conditioning pavlov", ' +
    '"social learning bandura", "attachment secure anxious avoidant", "bowlby strange ' +
    'situation", "attachment disorganized fearful", "developmental piaget stages", ' +
    '"vygotsky zone proximal", "erikson psychosocial stages", "kohlberg moral ' +
    'development", "big five personality ocean", "mbti jung typology", "hexaco honesty ' +
    'humility", "dsm 5 tr diagnosis", "icd 11 mental", "axis i mood disorder", "anxiety ' +
    'gad panic phobia", "depression mdd dysthymia", "bipolar mania hypomania", "ocd ' +
    'intrusive compulsion", "ptsd flashback intrusion", "borderline bpd splitting", ' +
    '"narcissistic npd grandiose", "antisocial aspd psychopathy", "schizophrenia positive ' +
    'negative symptom", "adhd inattentive hyperactive", "autism asd spectrum", ' +
    '"neuroplasticity ltp ltd", "synaptic transmission glutamate", "gaba inhibitory ' +
    'neurotransmitter", "dopamine reward pathway", "serotonin 5ht receptor", ' +
    '"norepinephrine arousal", "acetylcholine memory", "ssri ssnri reuptake inhibitor", ' +
    '"benzodiazepine gaba potentiation", "antipsychotic d2 receptor", "stimulant adhd ' +
    'dopamine", "lithium mood stabilizer", "eeg alpha beta theta", "fmri bold contrast", ' +
    '"default mode network", "hippocampus memory consolidation", "amygdala fear ' +
    'conditioning", "prefrontal executive function", "working memory baddeley", "long ' +
    'term episodic semantic", "implicit explicit memory", "false memory misinformation", ' +
    '"iat implicit association test", "stroop interference effect", "cognitive dissonance ' +
    'festinger", "self efficacy bandura") — never the literal question phrasing.',
  law:
    'If the input looks like Law SE questions (LAW / CONTRACT / TORT / CRIMINAL / ' +
    'CONSTITUTIONAL / PROPERTY / FAMILY / CORPORATE / IP / TAX / EMPLOYMENT / IMMIGRATION / ' +
    'EVIDENCE / PROCEDURE — legal-doctrine-craft framed, NOT politics Fri-23 governance and ' +
    'NOT workplace Fri-06 HR-policy and NOT money Anchor-04 personal-finance — "Is it ' +
    'legal to [action]", "What recourse if [event]", "Can [party] [contract / sue]"), ' +
    'distill to the law concept (e.g. "consideration contract formation", "offer ' +
    'acceptance mirror image", "promissory estoppel reliance", "parol evidence rule", ' +
    '"statute of frauds writing", "unconscionability adhesion contract", "breach material ' +
    'minor", "specific performance remedy", "liquidated damages clause", "mitigation duty ' +
    'plaintiff", "negligence duty breach causation", "proximate cause foreseeable", "res ' +
    'ipsa loquitur inference", "comparative contributory negligence", "strict liability ' +
    'product", "defamation libel slander actual malice", "intentional infliction emotional ' +
    'distress", "trespass conversion chattel", "false imprisonment tort", "mens rea ' +
    'actus reus", "felony murder rule", "miranda fifth amendment", "fourth amendment ' +
    'search seizure", "exclusionary rule fruit poisonous tree", "probable cause warrant", ' +
    '"due process procedural substantive", "equal protection scrutiny tier", "first ' +
    'amendment speech assembly", "commerce clause dormant", "supremacy clause preemption", ' +
    '"qualified immunity 1983", "fee simple fee tail", "joint tenancy survivorship", ' +
    '"easement appurtenant gross", "adverse possession hostile open", "landlord tenant ' +
    'warranty habitability", "foreclosure power of sale", "mortgage lien priority", ' +
    '"chapter 7 11 13 bankruptcy", "automatic stay creditor", "fiduciary duty director ' +
    'shareholder", "business judgment rule", "piercing corporate veil", "merger ' +
    'acquisition tender offer", "rule 10b 5 securities", "insider trading material ' +
    'nonpublic", "trademark distinctiveness secondary meaning", "copyright fair use four ' +
    'factor", "patent novelty nonobviousness", "claim construction markman", "trade ' +
    'secret misappropriation", "hearsay rule exceptions", "attorney client privilege ' +
    'work product", "personal jurisdiction minimum contacts", "subject matter diversity ' +
    'federal question", "summary judgment rule 56", "motion dismiss 12b6", "class action ' +
    'rule 23", "fmla ada title vii", "at will employment wrongful termination", "non ' +
    'compete reasonable scope") — never the literal question phrasing.',
  medicalsciences:
    'If the input looks like Medical Sciences SE questions (MEDICINE / CLINICAL / ' +
    'PHARMACOLOGY / PATHOLOGY / EPIDEMIOLOGY / DIAGNOSTICS / TREATMENT / DISEASE / ' +
    'SYNDROME / SYMPTOM / DRUG / PROCEDURE — applied-clinical-craft framed, NOT biology ' +
    'generic-living-systems and NOT psychology Sun-14 mental-health-craft and NOT cogsci ' +
    'Fri-04 academic-cognitive — "Why does [symptom / disease] [behavior]", "How is ' +
    '[condition] [diagnosed / treated]", "What [drug / mechanism] for [indication]"), ' +
    'distill to the medicine concept (e.g. "differential diagnosis approach", "evidence ' +
    'based medicine ebm", "randomized controlled trial rct", "number needed to treat nnt", ' +
    '"sensitivity specificity ppv npv", "likelihood ratio bayes", "receiver operating ' +
    'characteristic roc", "kaplan meier survival curve", "cox proportional hazards", ' +
    '"intention to treat analysis", "incidence prevalence rate", "case control cohort ' +
    'study", "meta analysis forest plot", "first pass hepatic metabolism", "cytochrome ' +
    'p450 inducer inhibitor", "pharmacokinetics absorption distribution", "half life ' +
    'steady state concentration", "loading maintenance dose", "therapeutic index window", ' +
    '"drug drug interaction", "ace inhibitor angiotensin", "beta blocker cardioselective", ' +
    '"calcium channel blocker", "statin hmgcoa reductase", "anticoagulation warfarin doac", ' +
    '"antiplatelet aspirin clopidogrel", "ssri serotonin syndrome", "antibiotic ' +
    'spectrum gram", "antibiotic resistance mrsa esbl", "vaccine adjuvant immunogenicity", ' +
    '"acute coronary syndrome stemi", "heart failure ejection fraction", "atrial ' +
    'fibrillation chads vasc", "stroke thrombolysis tpa", "asthma copd spirometry", ' +
    '"diabetic ketoacidosis dka", "hba1c glycemic control", "thyroid tsh free t4", ' +
    '"adrenal insufficiency cortisol", "acute kidney injury aki", "chronic kidney disease ' +
    'gfr", "electrolyte hyponatremia hyperkalemia", "acid base metabolic respiratory", ' +
    '"sepsis septic shock bundle", "pneumonia community hospital acquired", "tuberculosis ' +
    'latent active", "hiv viral load cd4", "hepatitis abc serology", "anemia iron b12 ' +
    'folate", "leukemia lymphoma classification", "stage tnm cancer", "tumor marker ' +
    'sensitivity", "imaging modality ct mri ultrasound", "ekg interpretation rate rhythm", ' +
    '"pulmonary embolism wells score", "deep vein thrombosis duplex", "stroke nih scale", ' +
    '"glasgow coma scale", "apgar newborn score", "vital signs trend interpretation", ' +
    '"informed consent capacity", "do not resuscitate dnr", "advance directive proxy", ' +
    '"iatrogenic complication", "differential by symptom fever weight loss", "screening ' +
    'recommendation uspstf grade") — never the literal question phrasing.',
  langdev:
    'If the input looks like Programming Language Design and Implementation SE questions ' +
    '(LANGUAGE DESIGN / PARSER / LEXER / TYPE SYSTEM / COMPILER / INTERPRETER / RUNTIME / ' +
    'SEMANTICS / SYNTAX / VM / GC / OPTIMIZATION — language-implementation-craft framed, ' +
    'NOT cs Thu-17 algorithms and NOT cstheory Fri-11 academic-theory and NOT ' +
    'softwareengineering Wed-17 architecture — "How do I [implement / design] [parser / ' +
    'type system]", "Why does [language / runtime] [behavior]", "What [strategy / pass] ' +
    'for [optimization / lowering]"), distill to the langdev concept (e.g. "lexer ' +
    'tokenizer regex", "lexer maximal munch", "parser recursive descent", "parser ' +
    'pratt operator precedence", "parser ll lr lalr", "parser combinator monadic", ' +
    '"parser earley glr", "parser packrat peg", "abstract syntax tree ast", "concrete ' +
    'syntax tree cst", "parse error recovery panic mode", "type inference hindley ' +
    'milner", "type inference bidirectional", "type checker unification", "type ' +
    'system polymorphism parametric", "type system row records", "type system gradual ' +
    'optional", "type system substructural linear affine", "type system dependent pi ' +
    'sigma", "type system effect rows", "type system refinement liquid", "type system ' +
    'subtyping variance", "trait type class dictionary", "module functor signature", ' +
    '"name resolution alpha conversion", "scope lexical dynamic", "closure capture ' +
    'environment", "ssa form static single", "control flow graph cfg", "data flow ' +
    'reaching definitions", "constant folding propagation", "common subexpression ' +
    'elimination", "dead code elimination dce", "loop invariant code motion", "loop ' +
    'unrolling vectorization", "inlining heuristic threshold", "tail call optimization ' +
    'tco", "register allocation graph coloring", "register allocation linear scan", ' +
    '"instruction selection burs", "scheduling ilp software pipelining", "peephole ' +
    'optimizer pattern", "lowering pass ir to ir", "garbage collection mark sweep", ' +
    '"garbage collection generational", "garbage collection concurrent incremental", ' +
    '"reference counting cycle collector", "memory management region arena", "stack vs ' +
    'heap allocation", "calling convention abi", "exception handling unwind tables", ' +
    '"continuation cps transformation", "delimited continuation reset shift", "tail ' +
    'recursion accumulator", "macro hygiene scheme", "macro procedural rust", ' +
    '"interpreter tree walking", "interpreter bytecode dispatch", "vm stack vs register ' +
    'machine", "jit baseline optimizing tier", "jit deoptimization on stack replacement", ' +
    '"foreign function interface ffi", "linker symbol relocation", "runtime ' +
    'system threading scheduler") — never the literal question phrasing.',
  drones:
    'If the input looks like Drones and Model Aircraft SE questions (DRONE / FPV / ' +
    'MULTIROTOR / RC / FLIGHT CONTROLLER / ESC / LIPO / PROPELLER / GIMBAL / GPS / ' +
    'AUTOPILOT — drone-pilot-craft framed, NOT aviation Wed-19 manned-aircraft and NOT ' +
    'robotics Thu-14 robotics-craft and NOT electronics default-22 EE-concept and NOT ' +
    'raspberrypi Tue-18 SBC-platform — "Why does my [drone / quad / fpv] [behavior]", ' +
    '"How do I [tune / configure] [betaflight / ardupilot]", "What [esc / motor / prop] ' +
    'for [build]"), distill to the drone concept (e.g. "flight controller pid tuning", ' +
    '"esc calibration bldc", "propeller pitch thrust", "motor kv rating", "lipo battery ' +
    'c rating", "lipo cell balance charging", "lipo battery storage voltage", "fpv ' +
    'goggles analog digital", "vtx video transmitter power", "fpv camera ccd cmos", ' +
    '"antenna circular polarized cloverleaf", "rc receiver protocol sbus crsf", ' +
    '"expresslrs elrs control link", "taranis radio mixes", "betaflight rates pid", ' +
    '"betaflight cli dump", "inav navigation modes", "ardupilot mission planner", ' +
    '"px4 firmware autopilot", "gps glonass module ublox", "magnetometer compass ' +
    'calibration", "accelerometer gyro mems", "barometer altitude hold", "optical flow ' +
    'position hold", "ekf state estimation drone", "return to home rtl logic", ' +
    '"geofence breach behavior", "failsafe configuration drone", "motor mixing ' +
    'quadcopter x h", "frame rigidity vibration damping", "soft mount imu silicone", ' +
    '"propeller balancing nail", "prop wash recovery", "yaw drift gyro", "vibration ' +
    'filter notch", "dynamic notch rpm", "blackbox log analysis", "betaflight osd ' +
    'elements", "smartaudio vtx control", "race quad cinewhoop tinywhoop", "fixed wing ' +
    'rc plane", "vtol tilt rotor design", "autonomous waypoint mission", "photogrammetry ' +
    'drone mapping", "lidar drone payload", "drone weight class part 107", "line of ' +
    'sight regulation", "no fly zone airspace", "remote id broadcast compliance", ' +
    '"brushless motor stator winding", "esc dshot bidirectional", "prop guard ducted ' +
    'fan", "foam edf jet build", "glider thermal soaring", "electric retract servo", ' +
    '"balance cg center gravity", "helicopter swashplate cyclic collective", ' +
    '"autorotation training heli", "fpv freestyle lipo punch out") — never the literal ' +
    'question phrasing.',
  proofassistants:
    'If the input looks like Proof Assistants SE questions (COQ / LEAN / AGDA / ISABELLE ' +
    '/ TACTIC / DEPENDENT TYPE / INDUCTIVE / FIXPOINT / TYPE CLASS / KERNEL — formal-' +
    'verification-craft framed, NOT math default-09 mathematics-generic and NOT cstheory ' +
    'Fri-11 academic-theory and NOT langdev Fri-02 language-implementation and NOT cs ' +
    'Thu-17 algorithms — "How do I prove [statement] in [coq / lean / agda]", "Why does ' +
    '[tactic / elaborator] [behavior]", "What [induction / unification] for [goal]"), ' +
    'distill to the proof assistant concept (e.g. "coq tactic proof", "coq inductive ' +
    'type", "coq dependent pattern matching", "coq universe polymorphism", "lean tactic ' +
    'mode", "lean term mode", "lean type class inference", "lean macro elaboration", ' +
    '"lean mathlib library", "agda dependent types", "agda termination checker", "agda ' +
    'copatterns coinduction", "isabelle hol locale", "isabelle isar structured proof", ' +
    '"isabelle sledgehammer integration", "intuitionistic logic curry howard", "calculus ' +
    'inductive constructions cic", "sigma type dependent pair", "pi type dependent ' +
    'function", "propositional equality refl", "heterogeneous equality jmeq", "univalence ' +
    'axiom hott", "cubical type theory path", "w type inductive", "definitional vs ' +
    'propositional equality", "well founded induction", "structural recursion ' +
    'guardedness", "fixpoint definition mutual", "tactic apply intro destruct", "tactic ' +
    'induction case analysis", "tactic ring lia omega", "tactic auto eauto hint", ' +
    '"tactic congruence decide equality", "ssreflect tactic small scale", "ltac tactic ' +
    'combinator", "ltac2 typed metaprogramming", "gallina specification language", ' +
    '"vernacular command coq", "kernel checker trusted core", "propositional truncation ' +
    'hprop", "setoid equivalence relation rewrite", "leibniz equality eq rect", ' +
    '"parametricity theorem free", "terminating partial function fuel", "extraction ocaml ' +
    'haskell", "code extraction soundness", "decidable equality dec", "classical logic ' +
    'excluded middle", "axiom of choice constructive", "propositional extensionality", ' +
    '"functional extensionality", "proof irrelevance hprop", "opaque definition qed ' +
    'defined", "hint database resolution", "eauto search depth", "omega presburger ' +
    'arithmetic", "lia linear integer", "micromega nra polynomial", "nia nonlinear ' +
    'integer", "refine tactic interactive", "type inference bidirectional", "type ' +
    'checker unification", "type system refinement liquid") — never the literal question ' +
    'phrasing.',
  solana:
    'If the input looks like Solana SE questions (ANCHOR / RUST PROGRAM / PDA / CPI / ' +
    'RENT / SLOT / SPL TOKEN / VALIDATOR / RPC / STAKE — solana-program-craft framed, ' +
    'NOT ethereum Mon-19 EVM-craft and NOT bitcoin Mon-23 utxo-craft and NOT monero ' +
    'Sat-23 privacy-craft and NOT crypto Sun-04 cryptography-academic — "How do I [build ' +
    '/ deploy] [anchor program]", "Why does [transaction / account] [error]", "What ' +
    '[seed / pda / cpi] for [flow]"), distill to the solana concept (e.g. "solana ' +
    'program rust anchor", "anchor program idl", "anchor account discriminator", ' +
    '"account constraints macros", "pda program derived address", "seeds bump ' +
    'canonical", "cross program invocation cpi", "cpi signer privileges", "account info ' +
    'lifetime", "system program account creation", "rent exempt minimum balance", "rent ' +
    'collection epoch", "slot epoch leader schedule", "leader rotation pos", "proof of ' +
    'history poh", "proof of stake stake weight", "validator vote credits", "vote ' +
    'account commission", "staking delegation account", "stake warmup cooldown", ' +
    '"transaction signature recent blockhash", "blockhash expiry slot", "fee payer ' +
    'instruction", "compute unit budget", "compute unit price priority", "priority fee ' +
    'market", "transaction size limit packet", "instruction order atomicity", "durable ' +
    'nonce account", "nonce advance instruction", "lookup table address", "versioned ' +
    'transaction v0", "jito bundle searcher", "mev arbitrage liquidator", "dex amm orca ' +
    'raydium", "openbook serum order book", "liquidity pool concentrated", "jupiter ' +
    'aggregator route", "lending borrow lending", "liquidation health factor", "perp ' +
    'dex drift mango", "oracle pyth switchboard", "pyth price feed update", "vrf ' +
    'verifiable randomness", "token program spl", "token 2022 extensions", "transfer ' +
    'hook extension", "metadata token metadata", "master edition nft", "candy machine ' +
    'mint", "compressed nft state", "merkle tree concurrent", "bubblegum cnft transfer", ' +
    '"light protocol zk compression", "solana rpc method", "getprogramaccounts filter ' +
    'memcmp", "geyser plugin streaming", "validator bigtable history", "snapshot ledger ' +
    'archive", "runtime parallel sealevel") — never the literal question phrasing.',
  french:
    'If the input looks like French Language SE questions (CONJUGATION / GENRE / ' +
    'AGREEMENT / SUBJONCTIF / PRONOUN / LIAISON / ELISION / VOCABULARY / IDIOM — french-' +
    'grammar-craft framed, NOT linguistics Thu-15 academic-linguistics and NOT ell ' +
    'Tue-13 english-learner and NOT japanese Tue-15 japanese-craft and NOT spanish ' +
    'Wed-09 spanish-craft and NOT italian Sun-22 italian-craft and NOT german chinese ' +
    'russian portuguese korean — "Why is [phrase] [grammar feature]", "How do I conjugate ' +
    '[verb] in [tense]", "What [pronoun / accord / preposition] for [context]"), distill ' +
    'to the french-grammar concept (e.g. "passe compose vs imparfait", "plus que parfait ' +
    'pluperfect", "futur simple stem", "futur anterieur compound", "conditionnel present ' +
    'polite", "conditionnel passe regret", "subjonctif present mood", "subjonctif passe ' +
    'doubt", "subjonctif imparfait literary", "indicatif vs subjonctif trigger", "si ' +
    'clause hypothesis", "si clause counterfactual", "infinitif passe", "gerondif en ' +
    'ant", "participe present adjective", "participe passe agreement", "accord cod ' +
    'precede", "etre vs avoir auxiliary", "verbes pronominaux reflexive", "pronoms cod ' +
    'coi placement", "en y pronom", "double pronoun order", "negation ne pas jamais", ' +
    '"ne expletif redundant", "articles partitifs du de la", "articles defini ' +
    'contraction", "genre noun grammatical", "pluriel irregulier x s", "adjectifs ' +
    'accord position", "adjectifs irreguliers beau bel", "adverbes formation ment", ' +
    '"comparatif superlatif plus moins", "prepositions a de en", "preposition lieu pays ' +
    'ville", "qui que dont relative", "qui vs lequel choice", "ce qui ce que", "dont ' +
    'vs duquel", "interrogation est ce que", "inversion sujet verbe", "c est vs il est", ' +
    '"falloir devoir obligation", "savoir vs connaitre", "pouvoir vs vouloir", "depuis ' +
    'pendant pour duration", "ago il y a", "faux amis cognate trap", "liaison ' +
    'obligatoire interdite", "elision apostrophe le la", "schwa e muet drop", "accents ' +
    'aigu grave circonflexe", "cedille c soft", "tu vs vous register", "tutoiement ' +
    'vouvoiement social", "langage soutenu courant familier", "argot verlan slang", ' +
    '"anglicismes franglais", "quebecois vs metropolitain", "ortho 1990 reform", ' +
    '"subjonctif plus que parfait literary") — never the literal question phrasing.',
  german:
    'If the input looks like German Language SE questions (DER DIE DAS / KASUS / ' +
    'KONJUGATION / KONJUNKTIV / PRÄTERITUM / WORTSTELLUNG / TRENNBARES VERB / ' +
    'WECHSELPRÄPOSITION / ADJEKTIVENDUNG / UMLAUT / ESZETT — german-grammar-craft framed, ' +
    'NOT linguistics Thu-15 academic-linguistics and NOT ell Tue-13 english-learner and ' +
    'NOT french Sun-02 french-craft and NOT spanish Wed-09 spanish-craft and NOT italian ' +
    'Sun-22 italian-craft and NOT japanese Tue-15 japanese-craft and NOT russian Tue-04 ' +
    'russian-craft and NOT chinese portuguese korean — "What is the [gender / case / ' +
    'plural] of [noun]", "Why does [verb] take [accusative / dative]", "How do I form ' +
    '[tense / mood] of [verb]"), distill to the german-grammar concept (e.g. "der die ' +
    'das gender", "noun gender memorization", "plural formation rules", "strong weak ' +
    'mixed declension", "nominative accusative case", "dative case verbs", "genitive ' +
    'case formal", "two way prepositions wechselpräpositionen", "accusative prepositions ' +
    'durch fur", "dative prepositions mit nach", "genitive prepositions trotz", ' +
    '"adjective endings strong", "adjective endings weak", "adjective endings mixed", ' +
    '"verb second word order", "subordinate clause verb final", "trennbares verb ' +
    'prefix", "separable prefix conjugation", "untrennbares verb inseparable", "modal ' +
    'verb double infinitive", "modalverb können dürfen", "perfekt aux haben sein", ' +
    '"präteritum literary tense", "plusquamperfekt past perfect", "futur I werden", ' +
    '"futur II completed", "konjunktiv I reported speech", "konjunktiv II subjunctive", ' +
    '"konjunktiv würde construction", "passive voice werden", "stative passive sein", ' +
    '"imperative du ihr sie", "reflexive verbs sich", "reciprocal einander", "pronouns ' +
    'nominative dative accusative", "es gibt existential", "man impersonal pronoun", ' +
    '"relative pronouns der die das", "relativsatz word order", "infinitive clauses zu", ' +
    '"infinitive um zu purpose", "dass clauses subordinate", "weil obwohl konnektor", ' +
    '"da prepositions damit dadurch", "hin her direction", "schon erst noch particles", ' +
    '"doch ja mal particle", "denn vs weil", "kein vs nicht negation", "negation ' +
    'position satzklammer", "umlaut a o u", "eszett rule sharp s", "noun capitalization", ' +
    '"compound nouns komposita", "n declension weak nouns", "denglisch anglicism", ' +
    '"false friends gift become", "redewendungen idioms", "swiss german ' +
    'schwyzerdütsch", "austrian deutsch variant", "bavarian dialect bayrisch", ' +
    '"hochdeutsch standard", "tu vs sie register", "duzen siezen social", ' +
    '"schriftsprache umgangssprache") — never the literal question phrasing.',
  chinese:
    'If the input looks like Chinese Language SE questions (PINYIN / TONE / HANZI / ' +
    'CLASSIFIER / BA-CONSTRUCTION / BEI-PASSIVE / LE ASPECT / DE MODIFIER / SHI COPULA / ' +
    'YOU EXISTENTIAL / RADICAL / SIMPLIFIED — mandarin-grammar-craft framed, NOT ' +
    'linguistics Thu-15 academic-linguistics and NOT ell Tue-13 english-learner and NOT ' +
    'japanese Tue-15 japanese-craft and NOT german french spanish italian russian ' +
    'portuguese korean — "What is the tone of [character]", "Why is [particle] used ' +
    'here", "How do I [classifier / construction] for [noun / context]"), distill to ' +
    'the chinese-grammar concept (e.g. "pinyin romanization system", "four tones ' +
    'diacritics", "neutral tone qingsheng", "tone sandhi third tone", "tone sandhi yi ' +
    'bu", "erhua retroflex suffix", "initials zh ch sh r", "finals u umlaut", ' +
    '"palatalization j q x", "syllable structure consonant", "hanzi simplified ' +
    'traditional", "radicals semantic component", "phonetic component compound", ' +
    '"stroke order convention", "stroke count lookup", "classifier measure word", ' +
    '"classifier ge default", "classifier zhang flat", "classifier tiao long", ' +
    '"classifier zhi animal", "classifier shuang paired", "le perfective aspect", "le ' +
    'change of state", "guo experiential aspect", "zhe ongoing aspect", "zai progressive ' +
    'aspect", "ba disposal construction", "bei passive construction", "shi copula ' +
    'identity", "you existential possession", "shi de emphasis cleft", "topic comment ' +
    'structure", "topicalization sentence", "comparison bi marker", "equality yiyang", ' +
    '"negation bu vs mei", "negation imperfective bu", "modal auxiliary neng hui keyi", ' +
    '"neng vs hui ability", "directional complement laiqu", "resultative complement ' +
    'wan", "potential complement de", "duration after verb", "frequency ci marker", ' +
    '"sentence final ma", "sentence final ne", "sentence final ba", "alternative ' +
    'question haishi", "rhetorical nandao", "reduplication verb softening", ' +
    '"reduplication adjective intensify", "chengyu four character idiom", "classical ' +
    'wenyan vs baihua", "loanwords kafei shafa", "polysemy ambiguity", "homophones tone ' +
    'confusion", "polite nin formal", "qing politeness", "register formal informal", ' +
    '"mandarin vs cantonese", "dialect putonghua standard", "taiwan vs mainland", ' +
    '"shanghainese wu dialect", "hokkien minnan", "ordinal di prefix", "dates lunar ' +
    'calendar") — never the literal question phrasing.',
}

const SYSTEM_BASE =
  'You extract concrete subject-matter topics that a personal AI should know about. ' +
  'Each topic should be a concrete subject like "mars exploration", "photosynthesis", ' +
  '"world war 2", "rust language", "diffusion models", "quantum entanglement", ' +
  '"vector databases", "agent frameworks" — ' +
  'this includes research / science fields and software/developer concepts. ' +
  'NOT meta-categories like "research" or "headlines" or "github repos". ' +
  'Output ONLY a JSON array of lowercase phrases, each 1 to 5 words, no quotes inside, ' +
  'no punctuation, no preamble. The topics must be DISTINCT (cover different angles or ' +
  'subjects) and ordered most-interesting first. Never output "none". '

const SYSTEM_TAIL = ' Example output: ["mars exploration", "ai safety", "world cup"]'

function buildSystemPrompt(): string {
  // Iterate SOURCE_CLAUSES insertion order (NOT EXTERNAL_SOURCES — that ring
  // is hour-sorted, which would shuffle clauses). hn/wikipedia/bbc contribute
  // empty strings and get filtered out. Verified byte-identical to v2.32's
  // hand-concatenated 11-clause prompt.
  const clauses = (Object.keys(SOURCE_CLAUSES) as ExternalSource[])
    .map((s) => SOURCE_CLAUSES[s])
    .filter(Boolean)
    .join(' ')
  return SYSTEM_BASE + clauses + SYSTEM_TAIL
}

// Run the same Haiku extractor used for organic clustering, but over an
// arbitrary list of titles. Returns up to `count` distinct lowercase 1-4 word
// topics. One Haiku call regardless of count — the prompt asks for a JSON
// array, so each extra topic costs only output tokens, not extra round-trips.
async function extractTopicsFromTitles(
  titles: string[],
  count: number,
  env: any
): Promise<{ topics: string[]; reason?: string; extractor?: string }> {
  if (!titles.length) return { topics: [], reason: 'no_titles' }
  const n = Math.max(1, Math.min(count || 1, 5))
  const sample = titles.slice(0, 30).map((s) => `- ${s}`).join('\n')
  const systemPrompt = buildSystemPrompt()
  const userPrompt = `Recent headlines:\n${sample}\n\nPick ${n} distinct subject-matter topics. Return ONLY a JSON array of ${n} lowercase phrases (1-5 words each), most-interesting first:`

  let answer = ''
  let extractor = ''
  let fallbackNote = ''

  // Primary: Anthropic Haiku.
  if (env.ANTHROPIC_API_KEY) {
    const callStart = Date.now()
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      })
      const data: any = await res.json()
      if (env.DB) {
        const u = anthropicUsage(data)
        await recordUsage(env.DB, {
          source: 'eval',
          model: 'claude-haiku-4-5-20251001',
          input_tokens: u.input,
          output_tokens: u.output,
          cache_read_tokens: u.cache_read,
          cache_create_tokens: u.cache_create,
          duration_ms: Date.now() - callStart
        })
      }
      answer = String(data?.content?.[0]?.text || '').trim()
      if (answer) {
        extractor = 'haiku'
      } else {
        const errType = data?.error?.type ?? data?.type ?? '?'
        const errMsg = String(data?.error?.message ?? data?.stop_reason ?? '').slice(0, 120)
        fallbackNote = `haiku_empty: type=${errType} msg=${errMsg}`
      }
    } catch (err: any) {
      fallbackNote = `haiku_error: ${String(err?.message ?? err).slice(0, 80)}`
    }
  } else {
    fallbackNote = 'no_anthropic_key'
  }

  // Fallback: Together.ai Llama. Pillar metric must keep moving even when
  // Anthropic credits are empty or the API is rate-limited.
  if (!answer && env.TOGETHER_API_KEY) {
    try {
      const tg = await callTogether({
        apiKey: env.TOGETHER_API_KEY,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 200,
        db: env.DB,
        source: 'extractor_together'
      })
      answer = (tg.text || '').trim()
      if (answer) extractor = `together:${tg.model.split('/').pop() || tg.model}`
    } catch (err: any) {
      fallbackNote += ` | together_error: ${String(err?.message ?? err).slice(0, 80)}`
    }
  }

  if (!answer) {
    return { topics: [], reason: `extract_empty: ${fallbackNote || 'no_extractor'}` }
  }

  // Parse a JSON array if present; fall back to first non-empty line as a single topic.
  const arrMatch = answer.match(/\[[\s\S]*?\]/)
  const raw: string[] = []
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0])
      if (Array.isArray(arr)) for (const v of arr) raw.push(String(v || ''))
    } catch { /* fall through */ }
  }
  if (!raw.length) {
    // Last-resort: one-topic-per-line fallback so old Haiku outputs still work.
    for (const line of answer.split(/\r?\n/)) raw.push(line)
  }

  const seen = new Set<string>()
  const topics: string[] = []
  for (const r of raw) {
    let t = r.toLowerCase().replace(/^["'`]+|["'`]+$/g, '').replace(/[.!?,:;]+$/, '').replace(/\s+/g, ' ').trim()
    if (!t || t === 'none' || t === 'n/a' || t === 'unknown') continue
    const words = t.split(/\s+/).filter(Boolean)
    if (words.length > 5) t = words.slice(0, 5).join(' ')
    if (t.length < 2 || t.length > 80) continue
    if (seen.has(t)) continue
    seen.add(t)
    topics.push(t)
    if (topics.length >= n) break
  }
  if (!topics.length) return { topics: [], reason: 'no_topics_extracted', extractor }
  return { topics, extractor }
}

// True if topic was already seeded via the external pipeline within `windowDays`.
async function externalRecentlySeeded(env: any, topic: string): Promise<boolean> {
  try {
    const v = await env.KV.get(`coverage:external:seeded:${topic}`)
    return !!v
  } catch (_err) {
    return false
  }
}

async function markExternalSeeded(env: any, topic: string, ts: string): Promise<void> {
  try {
    // 30-day TTL: trending evergreen topics get a chance to re-seed eventually
    await env.KV.put(`coverage:external:seeded:${topic}`, ts, { expirationTtl: 60 * 60 * 24 * 30 })
  } catch (_err) { /* non-fatal */ }
}

// Pick up to `count` distinct topics from an external source. For Wikipedia we
// don't need Haiku — the article slugs ARE topics — so we walk the cleaned list
// and return the first N not seeded in the last 30d. For HN and BBC we ask
// Haiku for N distinct topics in a single call. All paths return picked=[] cleanly
// so the caller can fall through to the next source.
export async function pickExternalTopics(
  env: any,
  source: ExternalSource,
  count: number
): Promise<ExternalMultiPick> {
  const n = Math.max(1, Math.min(count || 1, 5))

  if (source !== 'wikipedia') {
    // Haiku-extracted path: fetch sentence-shaped titles via the registry,
    // then distill to topics. SOURCE_FETCHERS is exhaustive over the union
    // (TS would flag a missing key), so the dispatch is type-safe.
    const titles = await SOURCE_FETCHERS[source](20)
    if (!titles.length) return { source, candidates: [], picked: [], reason: 'fetch_failed', fetched: 0 }
    const { topics, reason, extractor } = await extractTopicsFromTitles(titles, n, env)
    if (!topics.length) return { source, candidates: titles.slice(0, 10), picked: [], reason, fetched: titles.length, extractor }
    const fresh: string[] = []
    let allSeeded = true
    for (const t of topics) {
      if (!(await externalRecentlySeeded(env, t))) {
        fresh.push(t); allSeeded = false
      }
    }
    if (!fresh.length) {
      return { source, candidates: titles.slice(0, 10), picked: [], reason: allSeeded ? 'all_already_seeded' : 'already_seeded_recently', fetched: titles.length }
    }
    return { source, candidates: titles.slice(0, 10), picked: fresh, fetched: titles.length, extractor }
  }

  // wikipedia — slugs are already topic-shaped; just take first N not-seeded.
  const topics = await fetchWikipediaTopics(30)
  if (!topics.length) return { source, candidates: [], picked: [], reason: 'fetch_failed', fetched: 0 }
  const fresh: string[] = []
  for (const t of topics) {
    if (await externalRecentlySeeded(env, t)) continue
    if (fresh.includes(t)) continue
    fresh.push(t)
    if (fresh.length >= n) break
  }
  if (!fresh.length) {
    return { source, candidates: topics.slice(0, 10), picked: [], reason: 'all_already_seeded', fetched: topics.length }
  }
  return { source, candidates: topics.slice(0, 10), picked: fresh, fetched: topics.length }
}

// Back-compat: single-topic API still exposed; thin wrapper around pickExternalTopics.
// Kept so `force_source` paths that only want one topic don't change behavior.
export async function pickExternalTopic(env: any, source: ExternalSource): Promise<ExternalPick> {
  const m = await pickExternalTopics(env, source, 1)
  return {
    source: m.source,
    candidates: m.candidates,
    picked: m.picked[0] ?? null,
    fetched: m.fetched,
    ...(m.reason ? { reason: m.reason } : {})
  }
}

export { markExternalSeeded }
