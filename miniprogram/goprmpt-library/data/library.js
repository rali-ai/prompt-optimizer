// 由 scripts/build-miniprogram-data.mjs 从 library/*.json 生成，请勿手改。
// 改数据后运行：pnpm miniprogram:data
module.exports = {
  "categories": [
    {
      "id": "writing",
      "name": "写作创作",
      "description": "文章、故事、演讲稿和标题，从提纲到成稿。"
    },
    {
      "id": "translate",
      "name": "翻译润色",
      "description": "中外互译、改错别字、调语气、压篇幅，意思不走样。"
    },
    {
      "id": "office",
      "name": "职场办公",
      "description": "周报、邮件、会议纪要、汇报材料和表格公式。"
    },
    {
      "id": "product-data",
      "name": "产品与数据",
      "description": "需求文档、用户研究、竞品对比和数据解读。"
    },
    {
      "id": "coding",
      "name": "编程开发",
      "description": "读代码、查报错、写测试、写 SQL 和技术文档。"
    },
    {
      "id": "marketing",
      "name": "营销文案",
      "description": "种草笔记、卖点、短视频脚本、活动文案和评价回复。"
    },
    {
      "id": "study",
      "name": "学习教育",
      "description": "讲懂概念、出练习题、做学习计划、读论文和备课。"
    },
    {
      "id": "life",
      "name": "生活助手",
      "description": "旅行、做饭、送礼、记账、健身和难开口的对话。"
    },
    {
      "id": "thinking",
      "name": "思维决策",
      "description": "找盲点、比方案、追根因，把模糊的问题想清楚。"
    },
    {
      "id": "system",
      "name": "角色与系统提示词",
      "description": "客服、家教、编辑、智能体等助手的系统提示词模板。"
    },
    {
      "id": "poster",
      "name": "海报设计",
      "description": "活动、展览、节气、讲座等海报，写清版式与文字层级。"
    },
    {
      "id": "ecommerce",
      "name": "电商视觉",
      "description": "商品主图、场景图、促销横幅、包装和详情页卖点图。"
    },
    {
      "id": "illustration",
      "name": "插画风格",
      "description": "水彩、扁平矢量、水墨、绘本、线稿等可换主题的插画风格。"
    },
    {
      "id": "portrait",
      "name": "人像摄影",
      "description": "职业照、头像、胶片街拍和角色设定等人物画面。"
    },
    {
      "id": "infographic",
      "name": "信息图与PPT",
      "description": "流程图、时间线、知识卡片和演示文稿页面。"
    }
  ],
  "prompts": [
    {
      "id": "article-from-outline",
      "title": "按提纲写成文章",
      "summary": "把你的提纲和素材写成一篇结构完整、不注水的文章。",
      "prompt": "请按下面的提纲写一篇文章，发表在{{发布平台}}，读者是{{读者}}。\n\n这不是自由发挥：提纲里的每个要点都要写到，顺序不变，也不要另加提纲里没有的大段落。素材里给出的事实、数据和例子优先使用；需要举例而素材里没有时，可以用常识性的例子，但不要编造具体数字、人名和引语。\n\n写法要求：\n1. 开头两三句直接进入主题，不写“随着时代的发展”这类铺垫。\n2. 每个要点写成一个小节，配一个小标题；每节先给观点，再用例子或数据支撑。\n3. 每段不超过 150 字，少用排比和感叹句。\n4. 结尾用一段话收束全文，可以给读者一个具体的行动建议，不喊口号。\n5. 全文约 {{字数}} 字，语气{{语气}}。\n\n输出：1 个标题，加正文。不要输出写作说明。\n如果提纲少于 2 个要点，先列出需要我补充的信息，不要开始写。\n\n【提纲】\n{{提纲}}\n\n【素材】\n{{素材}}",
      "variables": [
        {
          "name": "提纲",
          "description": "文章要讲的几个要点，一行一个",
          "defaultValue": ""
        },
        {
          "name": "素材",
          "description": "数据、案例、引用等，没有就写“无”",
          "defaultValue": "无"
        },
        {
          "name": "读者",
          "description": "谁会读这篇文章",
          "defaultValue": "对这个话题感兴趣、但不了解细节的普通读者"
        },
        {
          "name": "发布平台",
          "description": "文章发在哪里，影响篇幅和语气",
          "defaultValue": "微信公众号"
        },
        {
          "name": "字数",
          "description": "目标字数",
          "defaultValue": "1500"
        },
        {
          "name": "语气",
          "description": "整体语气",
          "defaultValue": "平实，有自己的观点"
        }
      ],
      "category": "writing",
      "tags": [
        "长文",
        "提纲"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Turn an outline into an article",
        "summary": "Writes a complete, no-filler article from your outline and source material.",
        "prompt": "Write an article from the outline below. It will be published on {{platform}} for {{audience}}.\n\nStick to the outline: cover every point in the given order, and do not add major sections that are not in it. Use the facts, data and examples from the source material first. If you need an example the material does not provide, a common-knowledge example is fine, but do not invent specific numbers, names or quotes.\n\nHow to write it:\n1. Get to the topic within the first two or three sentences. No \"In today's fast-paced world\" openers.\n2. Give each outline point its own section with a subheading. Open each section with the claim, then support it with an example or data.\n3. Keep paragraphs under 100 words. Go easy on rhetorical lists and exclamation marks.\n4. End with one paragraph that ties the piece together. A concrete next step for the reader is welcome; slogans are not.\n5. Aim for about {{word_count}} words in a {{tone}} tone.\n\nOutput one title and the article. Do not explain your writing choices.\nIf the outline has fewer than 2 points, list what you need from me instead of writing.\n\n[Outline]\n{{outline}}\n\n[Source material]\n{{material}}",
        "variables": [
          {
            "name": "outline",
            "description": "The points the article should make, one per line",
            "defaultValue": ""
          },
          {
            "name": "material",
            "description": "Data, cases, quotes; write \"none\" if you have none",
            "defaultValue": "none"
          },
          {
            "name": "audience",
            "description": "Who will read it",
            "defaultValue": "general readers interested in the topic but new to the details"
          },
          {
            "name": "platform",
            "description": "Where it will be published",
            "defaultValue": "a company blog"
          },
          {
            "name": "word_count",
            "description": "Target length in words",
            "defaultValue": "1000"
          },
          {
            "name": "tone",
            "description": "Overall tone",
            "defaultValue": "plain and opinionated"
          }
        ]
      }
    },
    {
      "id": "opinion-essay",
      "title": "一个观点写成评论文章",
      "summary": "把一句观点展开成有前提、有论证、有反方回应的评论文章。",
      "prompt": "把下面这个观点写成一篇评论文章。设想读者原本不同意这个观点，文章要让他愿意认真考虑。\n\n【观点】\n{{观点}}\n\n按这个顺序展开：\n1. 开头：用一个具体场景或现象引出观点，100 字以内。\n2. 前提：这个观点成立需要哪些前提，逐条写明。\n3. 论证：2 到 3 个理由。每个理由先说清背后的机制，也就是“为什么会这样”，再配一个例子。\n4. 反方：写出最有力的一条反对意见，认真回应。对方有道理的部分，直接承认。\n5. 结论：说明观点在什么条件下成立、什么条件下不成立，最后一句落到读者能做的事上。\n\n要求：全文约 {{字数}} 字；不用“众所周知”“毋庸置疑”；不确定准确的数据写成定性描述，不给具体数字。\n如果观点含糊到无法论证（比如只有一个词），先用一句话问我具体想表达什么立场。",
      "variables": [
        {
          "name": "观点",
          "description": "一句话写清你的立场",
          "defaultValue": "城市应该给街边小店留出更多空间"
        },
        {
          "name": "字数",
          "description": "目标字数",
          "defaultValue": "1200"
        }
      ],
      "category": "writing",
      "tags": [
        "评论",
        "观点",
        "议论文"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Turn an opinion into an op-ed",
        "summary": "Expands a one-line opinion into an op-ed with premises, arguments and an honest rebuttal.",
        "prompt": "Turn the opinion below into an op-ed. Assume the reader currently disagrees; the piece should make them take the idea seriously.\n\n[Opinion]\n{{opinion}}\n\nStructure:\n1. Opening: introduce the opinion through a concrete scene or observation, under 80 words.\n2. Premises: list what has to be true for this opinion to hold.\n3. Arguments: 2 to 3 reasons. For each, first explain the mechanism, meaning why it works this way, then give an example.\n4. Counterargument: state the strongest objection and answer it honestly. Concede the parts it gets right.\n5. Conclusion: say when the opinion holds and when it does not, and end on something the reader can actually do.\n\nKeep it to about {{word_count}} words. Skip \"everyone knows\" and \"it goes without saying\". If you are not sure a statistic is accurate, describe the trend in words instead of giving a number.\nIf the opinion is too vague to argue (a single word, say), ask me one question about the position I want to take before writing.",
        "variables": [
          {
            "name": "opinion",
            "description": "Your position in one sentence",
            "defaultValue": "Cities should make more room for small street-level shops"
          },
          {
            "name": "word_count",
            "description": "Target length in words",
            "defaultValue": "900"
          }
        ]
      }
    },
    {
      "id": "short-story",
      "title": "短篇小说",
      "summary": "给出人物和冲突，写一篇有转折、有细节的短篇小说。",
      "prompt": "写一篇短篇小说，约 {{字数}} 字。\n\n【设定】\n主角：{{主角}}\n主角想要什么，被什么挡住：{{冲突}}\n时间地点：{{场景}}\n结局方向：{{结局}}\n\n写作要求：\n1. 用{{视角}}叙述。\n2. 第一段就让主角处在一个具体的动作或对话里，不先介绍背景；背景在后文分散交代。\n3. 冲突至少升级一次：主角的第一次尝试失败，或者付出代价，之后才走向结局。\n4. 情绪靠动作、对话和环境细节表现，少写“他很难过”这类直接陈述。\n5. 对话符合人物身份，每个人说话的方式要有区别。\n6. 结尾停在一个画面或一句话上，不在最后总结道理。\n\n只输出标题和正文。",
      "variables": [
        {
          "name": "主角",
          "description": "主角是谁，有什么特点",
          "defaultValue": "一个在小县城修了二十年钟表的中年女人"
        },
        {
          "name": "冲突",
          "description": "主角想要什么、被什么挡住",
          "defaultValue": "她想把店传给女儿，女儿只想去大城市"
        },
        {
          "name": "场景",
          "description": "故事发生的时间和地点",
          "defaultValue": "南方小县城，梅雨季"
        },
        {
          "name": "结局",
          "description": "开放、温暖、反转等方向",
          "defaultValue": "没有和解，但彼此理解的开放结局"
        },
        {
          "name": "视角",
          "description": "第一人称或第三人称",
          "defaultValue": "第三人称有限视角"
        },
        {
          "name": "字数",
          "description": "目标字数",
          "defaultValue": "3000"
        }
      ],
      "category": "writing",
      "tags": [
        "小说",
        "故事"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Short story",
        "summary": "Writes a short story with a real turning point and concrete detail from a character and a conflict.",
        "prompt": "Write a short story of about {{word_count}} words.\n\n[Setup]\nProtagonist: {{protagonist}}\nWhat they want and what stands in the way: {{conflict}}\nTime and place: {{setting}}\nEnding: {{ending}}\n\nGuidelines:\n1. Tell it in {{point_of_view}}.\n2. Open with the protagonist in the middle of an action or a conversation. Feed in backstory later, in small pieces.\n3. Escalate the conflict at least once: the first attempt fails or costs something before the story turns toward its ending.\n4. Show emotion through action, dialogue and setting rather than lines like \"she felt sad\".\n5. Give each character a distinct voice that fits who they are.\n6. End on an image or a line of dialogue. Do not spell out the moral.\n\nOutput only the title and the story.",
        "variables": [
          {
            "name": "protagonist",
            "description": "Who the main character is, plus a trait or two",
            "defaultValue": "a woman who has repaired watches in the same small-town shop for twenty years"
          },
          {
            "name": "conflict",
            "description": "What they want and what blocks them",
            "defaultValue": "she wants to hand the shop to her daughter, who only wants to leave for the city"
          },
          {
            "name": "setting",
            "description": "When and where",
            "defaultValue": "a small southern town in the rainy season"
          },
          {
            "name": "ending",
            "description": "Open, hopeful, twist, etc.",
            "defaultValue": "an open ending with no reconciliation, but mutual understanding"
          },
          {
            "name": "point_of_view",
            "description": "First or third person",
            "defaultValue": "close third person"
          },
          {
            "name": "word_count",
            "description": "Target length in words",
            "defaultValue": "2000"
          }
        ]
      }
    },
    {
      "id": "headline-options",
      "title": "文章标题备选",
      "summary": "根据正文给出 10 个不同写法的标题，并说明各自适合的情况。",
      "prompt": "为下面这篇文章起标题，发布在{{平台}}。\n\n先用一句话概括文章真正讲了什么，再给出 10 个标题，覆盖下面 5 种写法，每种 2 个：\n- 直接说结论\n- 提出读者关心的问题\n- 用具体数字或细节\n- 点出读者的身份或场景\n- 制造反差\n\n规则：\n- 标题里的信息必须能在正文中找到，不夸大，不承诺正文没有的内容。\n- 不用“震惊”“必看”“绝了”这类词，不堆感叹号。\n- 每个标题不超过 {{字数上限}} 个字。\n\n输出格式：\n一句话概括：……\n| 序号 | 标题 | 写法 | 适合的情况 |\n最后用一句话说你最推荐哪一个，以及理由。\n\n【正文】\n{{正文}}",
      "variables": [
        {
          "name": "正文",
          "description": "文章全文，或者最核心的几段",
          "defaultValue": ""
        },
        {
          "name": "平台",
          "description": "发布渠道",
          "defaultValue": "微信公众号"
        },
        {
          "name": "字数上限",
          "description": "标题最多多少字",
          "defaultValue": "24"
        }
      ],
      "category": "writing",
      "tags": [
        "标题",
        "新媒体"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Headline options",
        "summary": "Suggests 10 headlines in different styles for your article and says when each one fits.",
        "prompt": "Write headlines for the article below, which will run on {{platform}}.\n\nFirst summarize in one sentence what the article actually says. Then give 10 headlines, two in each of these five styles:\n- State the conclusion\n- Ask a question the reader cares about\n- Lead with a specific number or detail\n- Name the reader's role or situation\n- Set up a contrast\n\nRules:\n- Every claim in a headline must be supported by the article. No exaggeration, no promises the article does not keep.\n- No \"shocking\" or \"you won't believe\", and no stacked exclamation marks.\n- Keep each headline to {{max_length}} words or fewer.\n\nFormat:\nOne-sentence summary: ...\n| # | Headline | Style | Works best when |\nFinish with one sentence naming your top pick and why.\n\n[Article]\n{{article}}",
        "variables": [
          {
            "name": "article",
            "description": "The full article or its key paragraphs",
            "defaultValue": ""
          },
          {
            "name": "platform",
            "description": "Where it will be published",
            "defaultValue": "a newsletter"
          },
          {
            "name": "max_length",
            "description": "Maximum words per headline",
            "defaultValue": "12"
          }
        ]
      }
    },
    {
      "id": "rewrite-for-audience",
      "title": "换个读者重写",
      "summary": "同一份内容，按新读者的知识水平和关心点重写一遍。",
      "prompt": "把下面的内容改写给{{目标读者}}看。读者看完要能{{用途}}。\n\n动笔前先想清楚三件事，不用写出来：这类读者已经知道什么，最关心什么，会在哪里看不懂。\n\n规则：\n1. 事实、数字和结论保持不变，不加原文没有的信息。\n2. 读者不熟悉的术语换成日常说法；必须保留的术语，第一次出现时用一句话解释。\n3. 按读者最关心的顺序重新排列内容，不必沿用原文顺序。\n4. 删掉对这类读者没用的细节。\n5. 篇幅约为原文的{{篇幅}}。\n\n先输出改写后的全文，再用不超过 3 条说明删掉或调整了什么。\n输出语言与原文一致。\n\n【原文】\n{{原文}}",
      "variables": [
        {
          "name": "原文",
          "description": "要改写的内容",
          "defaultValue": ""
        },
        {
          "name": "目标读者",
          "description": "新读者是谁，越具体越好",
          "defaultValue": "没有技术背景的公司管理层"
        },
        {
          "name": "用途",
          "description": "读者看完要做什么",
          "defaultValue": "决定这个项目要不要立项"
        },
        {
          "name": "篇幅",
          "description": "相对原文的长度",
          "defaultValue": "一半"
        }
      ],
      "category": "writing",
      "tags": [
        "改写",
        "受众"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Rewrite for a different reader",
        "summary": "Rewrites the same content for a new reader's background and priorities.",
        "prompt": "Rewrite the content below for {{target_reader}}. After reading it, they should be able to {{goal}}.\n\nBefore writing, work out three things without writing them down: what this reader already knows, what they care about most, and where they would get lost.\n\nRules:\n1. Keep every fact, number and conclusion unchanged. Add nothing that is not in the original.\n2. Replace jargon the reader would not know with everyday words. If a term must stay, explain it in one sentence the first time it appears.\n3. Reorder the content around what this reader cares about most; you do not have to follow the original order.\n4. Cut details that are useless to this reader.\n5. Aim for about {{length}} the length of the original.\n\nOutput the rewritten text, then up to 3 bullet points on what you cut or moved.\nWrite in the same language as the original.\n\n[Original]\n{{original}}",
        "variables": [
          {
            "name": "original",
            "description": "The content to rewrite",
            "defaultValue": ""
          },
          {
            "name": "target_reader",
            "description": "Who the new reader is, as specifically as possible",
            "defaultValue": "senior managers with no technical background"
          },
          {
            "name": "goal",
            "description": "What they need to do after reading",
            "defaultValue": "decide whether to approve the project"
          },
          {
            "name": "length",
            "description": "Length relative to the original",
            "defaultValue": "half"
          }
        ]
      }
    },
    {
      "id": "speech-draft",
      "title": "演讲发言稿",
      "summary": "按场合、时长和听众写一篇适合念出来的发言稿。",
      "prompt": "写一篇发言稿。场合是{{场合}}，时长约 {{时长}} 分钟，听众是{{听众}}。\n\n我要讲的要点：\n{{要点}}\n\n这是念出来的稿子，不是书面文章：\n1. 句子短，一句话只说一件事，避免长定语。\n2. 按每分钟约 220 字控制总长度。\n3. 称呼一句带过，接着在 30 秒内讲一个具体的小场景引出主题，不堆客套话。\n4. 要点之间用口语化的过渡句连接，让听众知道讲到了哪里。\n5. 最后用一句容易记住的话收尾，再简短致谢。\n\n只写我给出的要点，不添加我没提到的成绩、数据和人名。\n输出发言稿全文，并在段落之间用【停顿】标出适合停顿的位置。",
      "variables": [
        {
          "name": "场合",
          "description": "在什么场合发言",
          "defaultValue": "公司年会上的团队获奖感言"
        },
        {
          "name": "时长",
          "description": "发言多少分钟",
          "defaultValue": "3"
        },
        {
          "name": "听众",
          "description": "听众是谁、大概多少人",
          "defaultValue": "全公司同事，约 200 人"
        },
        {
          "name": "要点",
          "description": "想讲的内容，一行一条",
          "defaultValue": ""
        }
      ],
      "category": "writing",
      "tags": [
        "演讲",
        "发言稿"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Speech draft",
        "summary": "Writes a speech for your occasion, time slot and audience that sounds natural read aloud.",
        "prompt": "Write a speech for {{occasion}}. It should run about {{minutes}} minutes, and the audience is {{audience}}.\n\nPoints I want to make:\n{{points}}\n\nThis will be spoken, not read:\n1. Use short sentences, one idea each. Avoid long modifiers.\n2. Budget about 130 words per minute.\n3. Keep the greeting to one line, then open with a small concrete moment within the first 30 seconds that leads into the topic.\n4. Connect the points with spoken transitions so listeners know where they are.\n5. Close with one line people will remember, then a brief thank-you.\n\nOnly use the points I gave. Do not add achievements, numbers or names I did not mention.\nOutput the full speech, with good places to pause marked [pause].",
        "variables": [
          {
            "name": "occasion",
            "description": "Where you are speaking",
            "defaultValue": "accepting a team award at the company's year-end party"
          },
          {
            "name": "minutes",
            "description": "Length in minutes",
            "defaultValue": "3"
          },
          {
            "name": "audience",
            "description": "Who is listening, and roughly how many",
            "defaultValue": "the whole company, about 200 people"
          },
          {
            "name": "points",
            "description": "What you want to say, one point per line",
            "defaultValue": ""
          }
        ]
      }
    },
    {
      "id": "novel-outline",
      "title": "长篇小说大纲",
      "summary": "从题材和核心冲突出发，生成分章节、伏笔有回收的小说大纲。",
      "prompt": "为一部{{题材}}小说做大纲，共 {{章节数}} 章。\n\n【已有设定】\n主角：{{主角}}\n核心冲突：{{核心冲突}}\n\n输出四部分：\n1. 一句话故事：主角是谁，想要什么，最大的阻碍是什么。\n2. 主要人物：3 到 5 个，每人写清目标、和主角的关系、在哪一章发生转变。\n3. 分章大纲：表格，列为“章节｜本章事件｜主角处境的变化｜埋下或回收的伏笔”。每章事件不超过 60 字。\n4. 三处关键转折：分别在全书约 1/4、1/2、3/4 处，说明它们为什么是故事必然走到的一步。\n\n要求：\n- 每一章都要让局面发生变化，不写只有日常过渡的章节。\n- 埋下的伏笔必须在后面某章回收，回收章节在表格里写明。\n- 设定里没给的世界观细节可以补充，但补充内容单独列在最后，标注“新增设定”。",
      "variables": [
        {
          "name": "题材",
          "description": "类型和基调",
          "defaultValue": "近未来悬疑"
        },
        {
          "name": "主角",
          "description": "主角是谁，有什么特别之处",
          "defaultValue": "一个能听见旧物记忆的二手店店主"
        },
        {
          "name": "核心冲突",
          "description": "贯穿全书的矛盾",
          "defaultValue": "她从一件旧大衣里听到一桩二十年前的失踪案，而案子牵涉她的父亲"
        },
        {
          "name": "章节数",
          "description": "一共多少章",
          "defaultValue": "24"
        }
      ],
      "category": "writing",
      "tags": [
        "小说",
        "大纲",
        "网文"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Novel outline",
        "summary": "Builds a chapter-by-chapter novel outline where every planted clue pays off.",
        "prompt": "Outline a {{genre}} novel in {{chapters}} chapters.\n\n[What I have]\nProtagonist: {{protagonist}}\nCentral conflict: {{central_conflict}}\n\nOutput four parts:\n1. Logline: who the protagonist is, what they want, and the biggest obstacle.\n2. Main characters: 3 to 5, each with their goal, their relationship to the protagonist, and the chapter where they change.\n3. Chapter outline: a table with columns \"Chapter | What happens | How the protagonist's situation changes | Clue planted or paid off\". Keep each \"what happens\" under 40 words.\n4. Three key turns at roughly the 1/4, 1/2 and 3/4 marks, and why the story has to go there.\n\nRequirements:\n- Every chapter must change the situation. No filler chapters.\n- Every planted clue pays off in a later chapter; note which one in the table.\n- You may add world-building details I did not give, but list them separately at the end under \"New details\".",
        "variables": [
          {
            "name": "genre",
            "description": "Genre and tone",
            "defaultValue": "near-future mystery"
          },
          {
            "name": "protagonist",
            "description": "Who they are and what is unusual about them",
            "defaultValue": "a secondhand-shop owner who can hear the memories of old objects"
          },
          {
            "name": "central_conflict",
            "description": "The tension that drives the whole book",
            "defaultValue": "an old coat reveals a disappearance from twenty years ago, and the case leads back to her father"
          },
          {
            "name": "chapters",
            "description": "Number of chapters",
            "defaultValue": "24"
          }
        ]
      }
    },
    {
      "id": "book-review",
      "title": "读书笔记写成书评",
      "summary": "把你的读书笔记和感受整理成一篇有自己观点的书评。",
      "prompt": "根据我的读书笔记写一篇书评，约 {{字数}} 字。书名：{{书名}}。\n\n书评只基于我的笔记。我没记下的情节、观点和引文不要补充，也不要凭印象引用书中原句。你对这本书的了解可以帮助理解我的笔记，但不要当成我的看法写进去。\n\n结构：\n1. 开头：这本书解决了什么问题，或者讲了什么故事，两三句话。\n2. 核心内容：挑笔记里最重要的 2 到 3 个观点或片段展开。\n3. 我的评价：我认同什么、怀疑什么，理由来自笔记里的感受。\n4. 推荐给谁：什么样的读者适合读，什么样的读者可以跳过。\n\n口吻是一个认真读完书的普通读者，不是出版社的宣传文案。\n如果笔记少于 3 条，先告诉我还需要补充哪些内容。\n\n【读书笔记】\n{{笔记}}",
      "variables": [
        {
          "name": "书名",
          "description": "书名和作者",
          "defaultValue": ""
        },
        {
          "name": "笔记",
          "description": "摘抄、感想、疑问都可以，一行一条",
          "defaultValue": ""
        },
        {
          "name": "字数",
          "description": "目标字数",
          "defaultValue": "1000"
        }
      ],
      "category": "writing",
      "tags": [
        "书评",
        "读书"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Turn reading notes into a book review",
        "summary": "Shapes your reading notes and reactions into a book review with a point of view.",
        "prompt": "Write a book review of about {{word_count}} words based on my reading notes. The book: {{book}}.\n\nBase the review only on my notes. Do not add plot points, arguments or quotes I did not record, and do not quote the book from memory. You can use what you know about the book to understand my notes, but do not present it as my opinion.\n\nStructure:\n1. Opening: what problem the book tackles or what story it tells, in two or three sentences.\n2. Core: expand on the 2 to 3 most important ideas or passages from my notes.\n3. My verdict: what I agree with and what I doubt, grounded in the reactions in my notes.\n4. Who should read it: who will get the most out of it, and who can skip it.\n\nWrite as an ordinary reader who finished the book, not as a publisher's blurb.\nIf I gave fewer than 3 notes, tell me what else you need before writing.\n\n[Reading notes]\n{{notes}}",
        "variables": [
          {
            "name": "book",
            "description": "Title and author",
            "defaultValue": ""
          },
          {
            "name": "notes",
            "description": "Highlights, thoughts and questions, one per line",
            "defaultValue": ""
          },
          {
            "name": "word_count",
            "description": "Target length in words",
            "defaultValue": "700"
          }
        ]
      }
    },
    {
      "id": "continue-story",
      "title": "续写故事不跑偏",
      "summary": "接着已有文字续写，人物性格、文风和设定保持一致。",
      "prompt": "接着下面的文字续写约 {{字数}} 字。\n\n续写前先确认这几点，不用输出：叙述视角和时态，每个出场人物的性格和说话方式，已经交代过的设定，上文停在什么情节上。\n\n要求：\n1. 从上文最后一句自然接下去，不重复已经写过的内容。\n2. 文风、句子长短和用词习惯与上文一致。\n3. 不改动已有设定；人物不做和性格明显矛盾的事，如果要转变，写出原因。\n4. 这一段的方向：{{方向}}\n5. 停在一个还能继续往下写的位置，不要把故事写完。\n\n只输出续写的正文。\n\n【上文】\n{{上文}}",
      "variables": [
        {
          "name": "上文",
          "description": "已经写好的部分，至少贴上最后几段",
          "defaultValue": ""
        },
        {
          "name": "方向",
          "description": "这一段要发生什么；没想好就写“自由发挥”",
          "defaultValue": "自由发挥，但要推进主线"
        },
        {
          "name": "字数",
          "description": "续写多少字",
          "defaultValue": "1500"
        }
      ],
      "category": "writing",
      "tags": [
        "续写",
        "小说"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Continue a story without drifting",
        "summary": "Continues your draft while keeping characters, style and world rules consistent.",
        "prompt": "Continue the text below for about {{word_count}} words.\n\nBefore you write, check these silently: point of view and tense, how each character behaves and talks, the world rules already established, and exactly where the last scene stopped.\n\nRequirements:\n1. Pick up naturally from the last sentence. Do not repeat anything already written.\n2. Match the existing style: sentence length, word choice, rhythm.\n3. Keep established facts intact. Characters should not act against their nature; if one changes, show why.\n4. Direction for this section: {{direction}}\n5. Stop at a point where the story can keep going. Do not wrap it up.\n\nOutput only the new text.\n\n[Story so far]\n{{story_so_far}}",
        "variables": [
          {
            "name": "story_so_far",
            "description": "What you have written, at least the last few paragraphs",
            "defaultValue": ""
          },
          {
            "name": "direction",
            "description": "What should happen next; write \"your call\" if unsure",
            "defaultValue": "your call, but move the main plot forward"
          },
          {
            "name": "word_count",
            "description": "How many words to add",
            "defaultValue": "1000"
          }
        ]
      }
    },
    {
      "id": "translate-natural",
      "title": "地道翻译",
      "summary": "把原文翻成读起来像母语者写的译文，而不是逐字直译。",
      "prompt": "把下面的原文翻译成{{目标语言}}，读者是{{读者}}。\n\n目标是让读者觉得这本来就是用{{目标语言}}写的：\n1. 先理解整段意思，再按目标语言的习惯重新组织句子，不逐字对应。\n2. 习语、俗语和文化梗，换成目标语言里意思相近的说法；找不到对应说法就意译，并加译注。\n3. 人名、品牌名、产品名保持原样，有通行译名的用通行译名。\n4. 数字、日期、单位准确，按目标语言的书写习惯写。\n5. 语气与原文一致：原文正式就正式，原文随意就随意。\n\n输出：\n- 译文\n- 译注：只列意译或拿不准的地方，每条写“原文｜译法｜理由”，没有就写“无”。\n\n【原文】\n{{原文}}",
      "variables": [
        {
          "name": "原文",
          "description": "要翻译的内容",
          "defaultValue": ""
        },
        {
          "name": "目标语言",
          "description": "翻译成哪种语言",
          "defaultValue": "英文"
        },
        {
          "name": "读者",
          "description": "译文给谁看",
          "defaultValue": "以目标语言为母语的普通读者"
        }
      ],
      "category": "translate",
      "tags": [
        "翻译",
        "意译"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Natural translation",
        "summary": "Translates text so it reads as if a native speaker wrote it, not word for word.",
        "prompt": "Translate the text below into {{target_language}} for {{audience}}.\n\nThe goal is for readers to feel it was written in {{target_language}} to begin with:\n1. Understand each passage as a whole, then rebuild the sentences the way the target language would say them. Do not map word for word.\n2. Replace idioms, sayings and cultural references with close equivalents. If there is none, translate the meaning and add a translator's note.\n3. Keep names of people, brands and products as they are, unless there is an established translation.\n4. Get numbers, dates and units exactly right, and format them the way the target language does.\n5. Match the register of the original: formal stays formal, casual stays casual.\n\nOutput:\n- The translation\n- Translator's notes: only where you translated loosely or were unsure, as \"original | translation | reason\". Write \"none\" if there are none.\n\n[Original]\n{{original}}",
        "variables": [
          {
            "name": "original",
            "description": "The text to translate",
            "defaultValue": ""
          },
          {
            "name": "target_language",
            "description": "The language to translate into",
            "defaultValue": "English"
          },
          {
            "name": "audience",
            "description": "Who will read the translation",
            "defaultValue": "native speakers of the target language"
          }
        ]
      }
    },
    {
      "id": "translate-tech-doc",
      "title": "技术文档翻译",
      "summary": "翻译技术文档时保留代码和格式，并按术语表统一译名。",
      "prompt": "把下面的技术文档翻译成{{目标语言}}。\n\n以下内容原样保留，不翻译：\n- 代码块、行内代码、命令、文件路径、URL、配置项名、API 名\n- Markdown 格式：标题层级、列表、表格、链接\n- 程序占位符，例如 {name}、%s、$VAR\n\n术语处理：\n1. 术语表里的词，一律按表中译法。\n2. 表里没有的专业术语，用该领域的通行译法，第一次出现时在括号里附上原文。\n3. 同一个术语全文只用一种译法。\n\n【术语表】\n{{术语表}}\n\n输出译文全文。最后附一张“新增术语”表，列出你自己决定译法的术语，格式为“原文｜译法”，方便我补进术语表。\n\n【原文】\n{{原文}}",
      "variables": [
        {
          "name": "原文",
          "description": "要翻译的文档，Markdown 或纯文本",
          "defaultValue": ""
        },
        {
          "name": "目标语言",
          "description": "翻译成哪种语言",
          "defaultValue": "简体中文"
        },
        {
          "name": "术语表",
          "description": "每行一条，格式“原文 = 译文”；没有就写“无”",
          "defaultValue": "无"
        }
      ],
      "category": "translate",
      "tags": [
        "翻译",
        "技术文档",
        "术语"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Technical document translation",
        "summary": "Translates technical docs with code and formatting intact and terms taken from your glossary.",
        "prompt": "Translate the technical document below into {{target_language}}.\n\nLeave these exactly as they are:\n- Code blocks, inline code, commands, file paths, URLs, config keys and API names\n- Markdown structure: heading levels, lists, tables, links\n- Program placeholders such as {name}, %s and $VAR\n\nTerminology:\n1. Use the glossary's translation for every term it lists.\n2. For technical terms not in the glossary, use the standard translation in the field and put the original term in parentheses the first time it appears.\n3. Use one translation per term throughout.\n\n[Glossary]\n{{glossary}}\n\nOutput the full translation. Then add a \"New terms\" table listing terms whose translation you chose yourself, as \"original | translation\", so I can add them to the glossary.\n\n[Original]\n{{original}}",
        "variables": [
          {
            "name": "original",
            "description": "The document to translate, Markdown or plain text",
            "defaultValue": ""
          },
          {
            "name": "target_language",
            "description": "The language to translate into",
            "defaultValue": "English"
          },
          {
            "name": "glossary",
            "description": "One entry per line as \"source = target\"; write \"none\" if you have none",
            "defaultValue": "none"
          }
        ]
      }
    },
    {
      "id": "polish-chinese",
      "title": "中文润色",
      "summary": "不改变意思，让中文更通顺，并列出每处改动的理由。",
      "prompt": "润色下面这段中文，力度为“{{力度}}”。\n\n力度说明：\n- 轻：只改错别字、病句、标点和明显不通顺的地方。\n- 中：在“轻”的基础上，删掉重复和空话，调整语序，让句子更顺。\n- 重：可以重组段落和句子，但观点、事实和数据不变。\n\n无论哪种力度：\n- 不加原文没有的观点、例子和数据。\n- 保留作者的口吻，不把口语改成公文腔，也不加华丽辞藻。\n- 专有名词和引用的原话不动。\n\n输出两部分：\n1. 润色后的全文。\n2. 改动说明表：| 原句 | 改为 | 原因 |，只列有实质改动的句子，最多 15 条。\n\n如果原文已经不需要修改，直接回复“无需修改”，不要为改而改。\n\n【原文】\n{{原文}}",
      "variables": [
        {
          "name": "原文",
          "description": "要润色的中文",
          "defaultValue": ""
        },
        {
          "name": "力度",
          "description": "轻、中、重三选一",
          "defaultValue": "中"
        }
      ],
      "category": "translate",
      "tags": [
        "润色",
        "修改"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Line edit without changing meaning",
        "summary": "Smooths out your writing without changing what it says, and explains every edit.",
        "prompt": "Edit the text below at the \"{{level}}\" level.\n\nLevels:\n- light: fix only typos, grammar, punctuation and clearly awkward phrasing.\n- medium: everything in light, plus cut repetition and filler and reorder clauses so sentences flow.\n- heavy: you may restructure paragraphs and sentences, but the ideas, facts and numbers stay the same.\n\nAt every level:\n- Add no ideas, examples or data that are not in the original.\n- Keep the author's voice. Do not turn casual writing into corporate prose or add flourishes.\n- Leave proper nouns and quoted material untouched.\n\nOutput:\n1. The edited text.\n2. A change log: | Original | Revised | Why |, only for substantive changes, at most 15 rows.\n\nIf the text needs no changes, just say \"No changes needed.\" Do not edit for the sake of editing.\n\n[Original]\n{{original}}",
        "variables": [
          {
            "name": "original",
            "description": "The text to edit",
            "defaultValue": ""
          },
          {
            "name": "level",
            "description": "light, medium or heavy",
            "defaultValue": "medium"
          }
        ]
      }
    },
    {
      "id": "academic-english-polish",
      "title": "学术英文润色",
      "summary": "按学术期刊的写法润色英文段落，并用中文解释主要修改。",
      "prompt": "润色下面这段英文学术写作。研究领域是{{领域}}，用途是{{用途}}。\n\n修改原则：\n1. 改正语法、拼写、冠词、时态和主谓一致问题。\n2. 表达更简洁准确：删冗余，去掉口语化用词，过长的句子拆开。\n3. 遵循该领域常见的学术写法，例如方法部分用过去时，陈述公认结论用现在时。\n4. 不改动论点、数据、引用和术语，不添加原文没有的结论。\n5. 读不懂作者意思的句子，保留原句并标出来，不要猜。\n\n输出：\n1. Revised text：润色后的英文全文。\n2. 修改说明：用中文列出最重要的 5 到 8 处修改，每条写“原文片段 → 修改后 → 原因”。\n3. 需要作者确认：意思不明确而没有改动的句子，没有就写“无”。\n\n【原文】\n{{原文}}",
      "variables": [
        {
          "name": "原文",
          "description": "要润色的英文段落",
          "defaultValue": ""
        },
        {
          "name": "领域",
          "description": "论文所属的研究领域",
          "defaultValue": "环境科学"
        },
        {
          "name": "用途",
          "description": "投稿、学位论文、基金申请等",
          "defaultValue": "SCI 期刊投稿"
        }
      ],
      "category": "translate",
      "tags": [
        "学术",
        "英文",
        "论文"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Academic English polishing",
        "summary": "Polishes an English academic passage to journal standard and explains the main edits.",
        "prompt": "Polish the academic English passage below. Field: {{field}}. Purpose: {{purpose}}.\n\nPrinciples:\n1. Fix grammar, spelling, articles, tense and subject-verb agreement.\n2. Make it concise and precise: cut redundancy, replace informal wording, split overlong sentences.\n3. Follow the conventions of the field, such as past tense for methods and present tense for established findings.\n4. Do not change claims, data, citations or terminology, and add no conclusions.\n5. If you cannot tell what a sentence means, leave it as is and flag it. Do not guess.\n\nOutput:\n1. Revised text: the full polished passage.\n2. Key edits: the 5 to 8 most important changes, each as \"original fragment | revised | reason\".\n3. For the author to confirm: unclear sentences you left unchanged, or \"none\".\n\n[Original]\n{{original}}",
        "variables": [
          {
            "name": "original",
            "description": "The English passage to polish",
            "defaultValue": ""
          },
          {
            "name": "field",
            "description": "Research field",
            "defaultValue": "environmental science"
          },
          {
            "name": "purpose",
            "description": "Journal submission, thesis, grant proposal, etc.",
            "defaultValue": "journal submission"
          }
        ]
      }
    },
    {
      "id": "proofread-typos",
      "title": "错别字和病句检查",
      "summary": "只找错不改写，逐条列出错别字、病句和标点问题及改法。",
      "prompt": "校对下面的文字。这次只找错，不润色：只标出确定有错的地方，不调整写作风格，不改写本身成立的句子。\n\n检查范围：\n- 错别字和同音字误用，例如“在”和“再”、“的地得”\n- 病句：成分残缺、搭配不当、语序不当、重复啰嗦\n- 标点：中英文标点混用，引号或括号不配对，顿号和逗号误用\n- 前后不一致：同一个名称、数字、日期在文中写法不同\n\n输出一张表：| 序号 | 原文片段 | 问题类型 | 建议改为 | 说明 |\n原文片段只截取能定位的一小段。按在文中出现的顺序排列。\n可改可不改的地方不要列。没有发现问题就回复“未发现错误”。\n\n【待校对文字】\n{{原文}}",
      "variables": [
        {
          "name": "原文",
          "description": "要校对的文字",
          "defaultValue": ""
        }
      ],
      "category": "translate",
      "tags": [
        "校对",
        "错别字"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Proofread for errors only",
        "summary": "Finds typos, grammar mistakes and punctuation problems without rewriting your style.",
        "prompt": "Proofread the text below. Find errors only; do not edit for style. Flag only things that are definitely wrong, and leave sentences that work as they are.\n\nCheck for:\n- Typos and commonly confused words, such as its/it's, affect/effect, than/then\n- Grammar: missing words, wrong word combinations, agreement errors, accidental repetition\n- Punctuation: unmatched quotes or brackets, comma splices, mixed punctuation styles\n- Inconsistencies: the same name, number or date written differently in different places\n\nOutput a table: | # | Original snippet | Problem type | Suggested fix | Note |\nQuote just enough of the original to locate each error, and list them in the order they appear.\nSkip matters of preference. If you find nothing, reply \"No errors found.\"\n\n[Text to proofread]\n{{text}}",
        "variables": [
          {
            "name": "text",
            "description": "The text to proofread",
            "defaultValue": ""
          }
        ]
      }
    },
    {
      "id": "tone-adjust",
      "title": "调整说话语气",
      "summary": "把一段话改成你想要的语气，信息一项不少。",
      "prompt": "把下面这段话改成“{{目标语气}}”的语气，发给{{对象}}。\n\n要求：\n1. 要传达的信息和要求一项都不能少，也不加新的承诺。\n2. 只调整措辞、语序和句式，篇幅与原文接近。\n3. 给出 3 个版本，语气由轻到重，每个版本前用一句话说明区别。\n4. 不用网络流行语和表情符号，除非原文本来就有。\n\n最后指出原文里最容易让对方不舒服的一个说法，并说明原因。\n\n【原文】\n{{原文}}",
      "variables": [
        {
          "name": "原文",
          "description": "你写好的话",
          "defaultValue": ""
        },
        {
          "name": "目标语气",
          "description": "想要的语气",
          "defaultValue": "礼貌但坚定"
        },
        {
          "name": "对象",
          "description": "你和对方的关系",
          "defaultValue": "合作方的项目负责人"
        }
      ],
      "category": "translate",
      "tags": [
        "语气",
        "改写",
        "沟通"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Adjust the tone of a message",
        "summary": "Rewrites a message in the tone you want without dropping any of its content.",
        "prompt": "Rewrite the message below in a \"{{target_tone}}\" tone. It is going to {{recipient}}.\n\nRequirements:\n1. Keep every piece of information and every request. Add no new commitments.\n2. Change only wording, order and sentence structure; keep the length close to the original.\n3. Give 3 versions, from softest to firmest, each introduced by one sentence on how it differs.\n4. No slang or emoji unless the original already uses them.\n\nFinally, point out the one phrase in the original most likely to rub the recipient the wrong way, and why.\n\n[Original]\n{{original}}",
        "variables": [
          {
            "name": "original",
            "description": "What you wrote",
            "defaultValue": ""
          },
          {
            "name": "target_tone",
            "description": "The tone you want",
            "defaultValue": "polite but firm"
          },
          {
            "name": "recipient",
            "description": "Who they are to you",
            "defaultValue": "the project lead at a partner company"
          }
        ]
      }
    },
    {
      "id": "localize-ui-strings",
      "title": "界面文案本地化",
      "summary": "把软件界面文案翻成目标语言，保留键名和占位符并控制长度。",
      "prompt": "把下面的软件界面文案翻译成{{目标语言}}。输入是 JSON，键名不变，只翻译值。\n\n规则：\n1. 程序占位符原样保留，包括 {count}、%d、{0} 这类写法，位置可以按语法调整。\n2. 按钮和菜单这类短文案用动词或名词短语，不加句号。\n3. 按钮和菜单文案不超过 {{按钮长度}} 个字符，否则界面上会显示不全。\n4. 同一个概念在所有条目里用同一种译法。\n5. 语气：{{产品语气}}。\n\n输出：\n1. 翻译后的 JSON，结构与输入完全一致，可以直接替换使用。\n2. 超长或有歧义的条目：| 键名 | 译文 | 问题 |，没有就写“无”。\n\n如果输入不是合法的 JSON，先指出语法错误的位置，不要翻译。\n\n【原文 JSON】\n{{文案}}",
      "variables": [
        {
          "name": "文案",
          "description": "界面文案的 JSON",
          "defaultValue": ""
        },
        {
          "name": "目标语言",
          "description": "翻译成哪种语言",
          "defaultValue": "英文"
        },
        {
          "name": "按钮长度",
          "description": "按钮和菜单文案的最大字符数",
          "defaultValue": "20"
        },
        {
          "name": "产品语气",
          "description": "产品说话的风格",
          "defaultValue": "简洁、友好，不卖萌"
        }
      ],
      "category": "translate",
      "tags": [
        "本地化",
        "界面文案",
        "i18n"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "UI string localization",
        "summary": "Translates app UI strings while keeping keys and placeholders intact and lengths in check.",
        "prompt": "Translate the app UI strings below into {{target_language}}. The input is JSON: keep every key, translate only the values.\n\nRules:\n1. Keep program placeholders such as {count}, %d and {0} exactly as written; you may move them to fit the grammar.\n2. Write buttons and menu items as short verb or noun phrases, without a final period.\n3. Keep button and menu labels to {{max_label_length}} characters or fewer so they fit on screen.\n4. Translate the same concept the same way across all strings.\n5. Voice: {{voice}}.\n\nOutput:\n1. The translated JSON with exactly the same structure as the input, ready to drop in.\n2. Strings that are too long or ambiguous: | Key | Translation | Issue |, or \"none\".\n\nIf the input is not valid JSON, point out where the syntax error is and do not translate.\n\n[Source JSON]\n{{strings}}",
        "variables": [
          {
            "name": "strings",
            "description": "The UI strings as JSON",
            "defaultValue": ""
          },
          {
            "name": "target_language",
            "description": "The language to translate into",
            "defaultValue": "Simplified Chinese"
          },
          {
            "name": "max_label_length",
            "description": "Maximum characters for buttons and menu items",
            "defaultValue": "20"
          },
          {
            "name": "voice",
            "description": "How the product talks",
            "defaultValue": "concise and friendly, not cutesy"
          }
        ]
      }
    },
    {
      "id": "weekly-report",
      "title": "周报生成器",
      "summary": "把零散的工作记录整理成结构清晰、可以直接发出去的周报。",
      "prompt": "把下面的工作记录整理成一份周报，发给{{汇报对象}}。\n\n只用记录里的事实：不补充没写的成果，不改动数字和人名。\n\n输出结构：\n1. 一句话总结：本周最重要的一个结果，30 字以内。\n2. 本周完成：每条一句话，以动词开头，有数据就带上数据。\n3. 进行中：每条写当前进度和预计完成时间。记录里看不出进度的写“进度未写明”，没有时间的写“时间待定”。\n4. 下周计划：只整理记录里提到的后续安排，没有提到就写“待补充”。\n5. 需要协助：写清需要谁做什么，没有就写“无”。\n\n语气平实，不用“圆满完成”“大力推进”这类空词。全文不超过 {{字数上限}} 字。\n如果记录是空的，或者看不出做过什么，只回复：“请先贴上本周的工作记录。”\n\n【本周工作记录】\n{{记录}}",
      "variables": [
        {
          "name": "记录",
          "description": "本周做过的事，一行一条，可以很零散",
          "defaultValue": ""
        },
        {
          "name": "汇报对象",
          "description": "周报发给谁",
          "defaultValue": "直属上级"
        },
        {
          "name": "字数上限",
          "description": "周报最多多少字",
          "defaultValue": "400"
        }
      ],
      "category": "office",
      "tags": [
        "周报",
        "汇报"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Weekly report generator",
        "summary": "Turns scattered work notes into a clear weekly report you can send as is.",
        "prompt": "Turn the work notes below into a weekly report for {{recipient}}.\n\nUse only facts from the notes. Do not add accomplishments, and do not change numbers or names.\n\nStructure:\n1. One-line summary: the single most important result this week, under 20 words.\n2. Done this week: one sentence per item, starting with a verb, with numbers where the notes have them.\n3. In progress: current status and expected completion for each. If the notes do not show progress, write \"status not stated\"; if there is no date, write \"date TBD\".\n4. Next week: only plans mentioned in the notes. If none are mentioned, write \"to be added\".\n5. Need help with: who you need and for what, or \"none\".\n\nKeep the tone plain. Skip filler like \"successfully delivered\" or \"actively driving\". Keep the whole report under {{max_words}} words.\nIf the notes are empty or show no work, reply only: \"Please paste this week's work notes first.\"\n\n[This week's notes]\n{{notes}}",
        "variables": [
          {
            "name": "notes",
            "description": "What you did this week, one item per line; rough is fine",
            "defaultValue": ""
          },
          {
            "name": "recipient",
            "description": "Who gets the report",
            "defaultValue": "my manager"
          },
          {
            "name": "max_words",
            "description": "Maximum length in words",
            "defaultValue": "250"
          }
        ]
      }
    },
    {
      "id": "meeting-minutes",
      "title": "会议纪要",
      "summary": "把会议记录或语音转写稿整理成结论、待办和待定问题。",
      "prompt": "把下面的会议记录整理成会议纪要。会议主题：{{会议主题}}。\n\n只用记录里出现的内容。记录里没说清楚的照实标注，不替参会人做决定。\n\n输出结构：\n1. 会议结论：已经拍板的事项，每条一句话。没有就写“本次未形成结论”。\n2. 待办事项：表格 | 事项 | 负责人 | 截止时间 |。记录里没有负责人或时间的填“未指定”。\n3. 待定问题：讨论了但没有结论的问题，写明卡在哪里。\n4. 讨论要点：按议题分组，每组 2 到 4 条，只保留影响决定的观点，注明是谁提的。\n\n删掉寒暄、重复发言和跑题的闲聊。人名、数字、日期照原样保留。\n如果记录是语音转写，遇到明显的识别错误按上下文改正，并在最后列出改过的词。\n\n【会议记录】\n{{记录}}",
      "variables": [
        {
          "name": "记录",
          "description": "会议记录或语音转写稿",
          "defaultValue": ""
        },
        {
          "name": "会议主题",
          "description": "一句话说明这次会讨论什么",
          "defaultValue": "项目周例会"
        }
      ],
      "category": "office",
      "tags": [
        "会议",
        "纪要",
        "待办"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Meeting minutes",
        "summary": "Turns meeting notes or a transcript into decisions, action items and open questions.",
        "prompt": "Turn the meeting notes below into minutes. Meeting topic: {{topic}}.\n\nUse only what appears in the notes. Where something was left unclear, record it as unclear; do not make decisions on the attendees' behalf.\n\nStructure:\n1. Decisions: items that were settled, one sentence each. If none, write \"No decisions this meeting\".\n2. Action items: a table | Task | Owner | Due date |. Use \"unassigned\" when the notes give no owner or date.\n3. Open questions: discussed but unresolved, with what is blocking each one.\n4. Discussion highlights: grouped by topic, 2 to 4 points per group, keeping only views that affected decisions, each attributed to whoever raised it.\n\nDrop small talk, repetition and off-topic chat. Keep names, numbers and dates exactly as given.\nIf the notes are a speech-to-text transcript, fix obvious recognition errors from context and list the words you changed at the end.\n\n[Meeting notes]\n{{notes}}",
        "variables": [
          {
            "name": "notes",
            "description": "Meeting notes or a transcript",
            "defaultValue": ""
          },
          {
            "name": "topic",
            "description": "What the meeting was about, in one line",
            "defaultValue": "weekly project sync"
          }
        ]
      }
    },
    {
      "id": "work-email",
      "title": "工作邮件",
      "summary": "写一封主题明确、对方读完就知道要做什么的工作邮件。",
      "prompt": "帮我写一封工作邮件。\n\n收件人：{{收件人}}\n这封邮件的目的：{{目的}}\n要写进去的信息：\n{{要点}}\n\n要求：\n1. 主题行写清事情和需要对方做的动作，不超过 25 个字。\n2. 第一段说明来意和需要对方做什么；有截止时间就写在这里。\n3. 背景和细节放在后面，用编号列出，每条一件事。\n4. 语气{{语气}}，不用“百忙之中”“不胜感激”这类套话。\n5. 只用我给的信息。缺少对方办这件事必需的信息（时间、地点、文件等）时，在邮件里用【待补充：……】标出。\n\n输出：主题行、正文、署名占位。",
      "variables": [
        {
          "name": "收件人",
          "description": "对方是谁，和你是什么关系",
          "defaultValue": "另一个部门的同级同事"
        },
        {
          "name": "目的",
          "description": "一句话说明要对方做什么",
          "defaultValue": "请对方在周五前给出新版合同的法务意见"
        },
        {
          "name": "要点",
          "description": "要写进邮件的事实，一行一条",
          "defaultValue": ""
        },
        {
          "name": "语气",
          "description": "邮件语气",
          "defaultValue": "礼貌、直接"
        }
      ],
      "category": "office",
      "tags": [
        "邮件",
        "沟通"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Work email",
        "summary": "Writes a work email with a clear subject line so the recipient knows exactly what to do.",
        "prompt": "Write a work email for me.\n\nRecipient: {{recipient}}\nPurpose: {{purpose}}\nInformation to include:\n{{points}}\n\nRequirements:\n1. The subject line names the matter and the action needed, in 10 words or fewer.\n2. The first paragraph says why I am writing and what I need from them, including any deadline.\n3. Background and details come after that, as a numbered list with one item per point.\n4. Keep the tone {{tone}}. No \"I hope this email finds you well\" or similar filler.\n5. Use only the information I gave. If something the recipient needs in order to act is missing, such as a time, place or file, mark it in the email as [To add: ...].\n\nOutput: subject line, body, signature placeholder.",
        "variables": [
          {
            "name": "recipient",
            "description": "Who they are and how you work with them",
            "defaultValue": "a peer in another department"
          },
          {
            "name": "purpose",
            "description": "What you need from them, in one sentence",
            "defaultValue": "get legal's comments on the revised contract by Friday"
          },
          {
            "name": "points",
            "description": "Facts to include, one per line",
            "defaultValue": ""
          },
          {
            "name": "tone",
            "description": "Tone of the email",
            "defaultValue": "polite and direct"
          }
        ]
      }
    },
    {
      "id": "reply-difficult-message",
      "title": "回复棘手消息",
      "summary": "面对催促、甩锅或不合理要求，写出守住立场又不伤关系的回复。",
      "prompt": "我收到一条不好回的消息，请帮我写回复。\n\n【对方的消息】\n{{对方消息}}\n\n【我的情况和立场】\n{{我的立场}}\n\n【底线】\n{{底线}}\n\n先用两三句话分析：对方真正想要什么，哪句话最需要回应，哪句可以不接。\n\n然后写 3 个版本的回复：\n- 版本 A：温和。先认可对方的处境，再说明我的立场。\n- 版本 B：直接。简短说明能做什么、不能做什么。\n- 版本 C：给替代方案，把讨论引到双方都能接受的方向。\n\n每个版本都守住底线，不做我没同意的承诺，不指责对方。长度适合在{{渠道}}里发送。",
      "variables": [
        {
          "name": "对方消息",
          "description": "对方发来的原话",
          "defaultValue": ""
        },
        {
          "name": "我的立场",
          "description": "你的处境和想表达的意思",
          "defaultValue": ""
        },
        {
          "name": "底线",
          "description": "哪些绝对不能让步",
          "defaultValue": "本周内无法交付"
        },
        {
          "name": "渠道",
          "description": "回复发在哪里",
          "defaultValue": "微信"
        }
      ],
      "category": "office",
      "tags": [
        "沟通",
        "拒绝",
        "回复"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Reply to a difficult message",
        "summary": "Drafts replies to pushy or unreasonable messages that hold your position without burning the relationship.",
        "prompt": "I got a message that is hard to answer. Help me reply.\n\n[Their message]\n{{their_message}}\n\n[My situation and position]\n{{my_position}}\n\n[My bottom line]\n{{bottom_line}}\n\nFirst, in two or three sentences: what they actually want, which line most needs a response, and which can be left alone.\n\nThen write 3 replies:\n- A, warm: acknowledge their situation first, then state my position.\n- B, direct: briefly say what I can and cannot do.\n- C, alternative: offer another option and steer toward something we can both accept.\n\nEvery version holds my bottom line, makes no promises I have not agreed to, and blames no one. Keep the length right for {{channel}}.",
        "variables": [
          {
            "name": "their_message",
            "description": "Their exact words",
            "defaultValue": ""
          },
          {
            "name": "my_position",
            "description": "Your situation and what you want to get across",
            "defaultValue": ""
          },
          {
            "name": "bottom_line",
            "description": "What you will not give up",
            "defaultValue": "I cannot deliver this week"
          },
          {
            "name": "channel",
            "description": "Where you will reply",
            "defaultValue": "Slack"
          }
        ]
      }
    },
    {
      "id": "report-to-boss",
      "title": "向上汇报：结论先行",
      "summary": "把一件事的来龙去脉整理成上级一分钟能看懂的汇报。",
      "prompt": "把下面的材料整理成给{{汇报对象}}的汇报，对方大概只有 {{阅读时间}} 来看。\n\n用结论先行的结构：\n1. 结论：第一句话说清现在是什么情况，需要对方做什么（拍板、给资源，还是知悉即可）。\n2. 理由：不超过 3 条，按重要程度排列，每条一句话，有数据就带上。\n3. 方案：如果需要对方拍板，列出 2 到 3 个选项，写明各自的代价，并说明我推荐哪个。\n4. 风险和下一步：一两句话。\n\n规则：\n- 只用材料里的信息，材料没有的数据不要估算。\n- 不写过程流水账，上级想看过程会再问。\n- 用词直接，少用“基本”“大概”“正在推进”。\n\n如果从材料里看不出需要对方做什么，在开头单独问我。\n\n【材料】\n{{材料}}",
      "variables": [
        {
          "name": "材料",
          "description": "事情经过、数据、你的判断，越完整越好",
          "defaultValue": ""
        },
        {
          "name": "汇报对象",
          "description": "汇报给谁",
          "defaultValue": "部门负责人"
        },
        {
          "name": "阅读时间",
          "description": "对方读这份汇报的时间",
          "defaultValue": "1 分钟"
        }
      ],
      "category": "office",
      "tags": [
        "汇报",
        "结论先行"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Bottom-line-up-front update",
        "summary": "Turns the full story of an issue into an update your manager can read in a minute.",
        "prompt": "Turn the material below into an update for {{recipient}}, who has about {{reading_time}} to read it.\n\nLead with the bottom line:\n1. Bottom line: in the first sentence, say where things stand and what you need from them: a decision, resources, or just awareness.\n2. Why: up to 3 reasons in order of importance, one sentence each, with numbers where available.\n3. Options: if they need to decide, give 2 to 3 options with the cost of each, and say which one I recommend.\n4. Risks and next step: one or two sentences.\n\nRules:\n- Use only the material. Do not estimate numbers it does not contain.\n- No blow-by-blow history. They will ask if they want it.\n- Be direct. Avoid \"basically\", \"roughly\" and \"making progress\".\n\nIf the material does not make clear what they need to do, ask me that first, at the top.\n\n[Material]\n{{material}}",
        "variables": [
          {
            "name": "material",
            "description": "What happened, the data, your judgment; the more complete the better",
            "defaultValue": ""
          },
          {
            "name": "recipient",
            "description": "Who the update is for",
            "defaultValue": "my department head"
          },
          {
            "name": "reading_time",
            "description": "How long they have to read it",
            "defaultValue": "1 minute"
          }
        ]
      }
    },
    {
      "id": "ppt-outline",
      "title": "汇报 PPT 大纲",
      "summary": "根据汇报内容生成逐页大纲，每页标题就是一句结论。",
      "prompt": "为下面的内容做一份 PPT 大纲，用于{{场合}}，约 {{页数}} 页。\n\n每页标题写成一句结论，例如“新渠道获客成本比老渠道低 30%”，而不是“渠道分析”。\n\n输出表格：| 页码 | 标题（结论句） | 页面要点（不超过 3 条） | 建议的图表或配图 |\n\n要求：\n1. 第 1 页是封面，第 2 页是全篇结论摘要，最后一页是需要听众拍板或配合的事项。\n2. 一页只讲一个结论。\n3. 数据只用材料里的。需要数据但材料里没有的页面，在要点里写【需补数据：……】。\n4. 建议图表时写明类型和理由，例如“折线图，看趋势”“柱状图，做对比”，不要只写“配图”。\n\n【汇报内容】\n{{内容}}",
      "variables": [
        {
          "name": "内容",
          "description": "要汇报的材料或要点",
          "defaultValue": ""
        },
        {
          "name": "场合",
          "description": "给谁讲、讲多久",
          "defaultValue": "季度业务复盘会，20 分钟"
        },
        {
          "name": "页数",
          "description": "大约多少页",
          "defaultValue": "12"
        }
      ],
      "category": "office",
      "tags": [
        "PPT",
        "大纲",
        "汇报"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Slide deck outline",
        "summary": "Turns your content into a slide-by-slide outline where every title states a conclusion.",
        "prompt": "Outline a slide deck for {{occasion}} from the content below, about {{slide_count}} slides.\n\nWrite each slide title as a conclusion, such as \"The new channel acquires customers 30% cheaper\", not \"Channel analysis\".\n\nOutput a table: | Slide | Title (a conclusion) | Key points (3 max) | Suggested chart or visual |\n\nRequirements:\n1. Slide 1 is the cover, slide 2 summarizes all conclusions, and the last slide lists what the audience needs to decide or help with.\n2. One conclusion per slide.\n3. Use only data from the content. If a slide needs data the content does not have, write [Data needed: ...] in its key points.\n4. When suggesting a chart, name the type and the reason, such as \"line chart, shows the trend\" or \"bar chart, compares options\". Never just \"add a visual\".\n\n[Content]\n{{content}}",
        "variables": [
          {
            "name": "content",
            "description": "The material or key points to present",
            "defaultValue": ""
          },
          {
            "name": "occasion",
            "description": "Who you are presenting to and for how long",
            "defaultValue": "a 20-minute quarterly business review"
          },
          {
            "name": "slide_count",
            "description": "Roughly how many slides",
            "defaultValue": "12"
          }
        ]
      }
    },
    {
      "id": "resume-bullets",
      "title": "简历经历改写",
      "summary": "把平淡的工作描述改成有动作、有结果、贴合目标岗位的简历条目。",
      "prompt": "把我的工作经历改写成简历条目，目标岗位是{{目标岗位}}。\n\n每条用“动作 + 对象 + 结果”的结构，以动词开头。\n\n规则：\n1. 只用我提供的事实。结果里的数字只能来自原文；原文没有数字但适合量化的地方，写成【补充数据：例如……】提醒我。\n2. 优先保留和目标岗位相关的经历，无关的压缩成一句或删掉。\n3. 每条不超过 40 个字，每段经历 3 到 5 条。\n4. 不用“负责”“参与”这类看不出贡献的词开头，不写“抗压能力强”这类自我评价。\n\n输出：\n1. 改写后的条目，按经历分组。\n2. 对照目标岗位的常见要求，我的经历里还缺什么，列 2 到 3 条。\n\n【原始经历】\n{{经历}}",
      "variables": [
        {
          "name": "经历",
          "description": "每段工作做过的事，越具体越好",
          "defaultValue": ""
        },
        {
          "name": "目标岗位",
          "description": "想投的岗位",
          "defaultValue": "新媒体运营"
        }
      ],
      "category": "office",
      "tags": [
        "简历",
        "求职"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Resume bullet rewrite",
        "summary": "Turns flat job descriptions into action-and-result resume bullets aimed at your target role.",
        "prompt": "Rewrite my work experience as resume bullets for a {{target_role}} role.\n\nEach bullet follows \"action + what + result\" and starts with a verb.\n\nRules:\n1. Use only the facts I give. Numbers in results must come from my text. Where a number would help but I gave none, write [Add data: for example ...] as a reminder.\n2. Put experience relevant to the target role first; compress or drop the rest.\n3. Keep each bullet under 25 words, with 3 to 5 bullets per job.\n4. Do not start with \"Responsible for\" or \"Participated in\", and leave out self-praise like \"strong work ethic\".\n\nOutput:\n1. The rewritten bullets, grouped by job.\n2. 2 to 3 common requirements for this role that my experience does not yet show.\n\n[My experience]\n{{experience}}",
        "variables": [
          {
            "name": "experience",
            "description": "What you did in each job, as specifically as possible",
            "defaultValue": ""
          },
          {
            "name": "target_role",
            "description": "The role you are applying for",
            "defaultValue": "content marketing"
          }
        ]
      }
    },
    {
      "id": "interview-prep",
      "title": "面试准备",
      "summary": "根据岗位描述和你的经历，预测高频问题并准备回答要点。",
      "prompt": "帮我准备面试。\n\n【岗位描述】\n{{岗位描述}}\n\n【我的经历】\n{{我的经历}}\n\n按以下顺序输出：\n1. 这个岗位最看重的 3 到 5 项能力，每项引用岗位描述中的原话作为依据。\n2. 面试官最可能问的 8 个问题，其中至少 2 个是针对我经历里薄弱点的追问。\n3. 每个问题的回答要点：按“情境、任务、行动、结果”的顺序，从我的经历里选素材。找不到合适素材的，直接说明，并建议我准备什么样的例子。\n4. 我可以反问面试官的 3 个问题。\n\n不替我编经历和数据。回答要点写成提纲，不写成背诵稿。",
      "variables": [
        {
          "name": "岗位描述",
          "description": "招聘页上的岗位职责和要求",
          "defaultValue": ""
        },
        {
          "name": "我的经历",
          "description": "简历内容或相关经历",
          "defaultValue": ""
        }
      ],
      "category": "office",
      "tags": [
        "面试",
        "求职"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Interview prep",
        "summary": "Predicts likely interview questions from the job description and your background, with answer outlines.",
        "prompt": "Help me prepare for an interview.\n\n[Job description]\n{{job_description}}\n\n[My background]\n{{my_background}}\n\nOutput in this order:\n1. The 3 to 5 abilities this role values most, each backed by a quote from the job description.\n2. The 8 questions the interviewer is most likely to ask, including at least 2 follow-ups that probe weak spots in my background.\n3. An answer outline for each question in Situation, Task, Action, Result order, using material from my background. If my background has nothing suitable, say so and suggest what kind of example I should prepare.\n4. 3 questions I can ask the interviewer.\n\nDo not invent experience or numbers for me. Keep the answers as outlines, not scripts to memorize.",
        "variables": [
          {
            "name": "job_description",
            "description": "Responsibilities and requirements from the posting",
            "defaultValue": ""
          },
          {
            "name": "my_background",
            "description": "Your resume or relevant experience",
            "defaultValue": ""
          }
        ]
      }
    },
    {
      "id": "excel-formula",
      "title": "Excel 公式助手",
      "summary": "用大白话描述需求，得到能直接粘贴的 Excel 或 WPS 公式。",
      "prompt": "我要在{{软件}}里写一个公式。\n\n【表格结构】\n{{表格结构}}\n\n【想得到的结果】\n{{需求}}\n\n请输出：\n1. 公式：能直接粘贴的完整公式，写明放在哪个单元格、要不要向下填充。\n2. 逐段解释：公式每一部分在做什么，用大白话。\n3. 边界情况：遇到空单元格、文本格式的数字、找不到匹配值时会得到什么结果，怎么处理。\n4. 如果有更简单的办法，例如数据透视表或筛选，用一两句话提一下。\n\n如果用到较新的函数，例如 XLOOKUP、FILTER，另给一个旧版本也能用的写法。\n如果表格结构说得不清楚，无法确定列的位置，先问我，不要假设。",
      "variables": [
        {
          "name": "软件",
          "description": "Excel 或 WPS",
          "defaultValue": "Excel"
        },
        {
          "name": "表格结构",
          "description": "每列放什么，数据从第几行到第几行",
          "defaultValue": "A 列日期，B 列销售员，C 列金额，数据在第 2 行到第 500 行"
        },
        {
          "name": "需求",
          "description": "想算出什么",
          "defaultValue": "统计每个销售员在 2026 年 10 月的总金额"
        }
      ],
      "category": "office",
      "tags": [
        "Excel",
        "公式",
        "表格"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Spreadsheet formula helper",
        "summary": "Describe what you need in plain words and get an Excel or Google Sheets formula you can paste in.",
        "prompt": "I need a formula in {{app}}.\n\n[Sheet layout]\n{{layout}}\n\n[What I want]\n{{goal}}\n\nPlease give me:\n1. The formula: complete and ready to paste, with which cell it goes in and whether to fill it down.\n2. A plain-language walkthrough of what each part does.\n3. Edge cases: what happens with blank cells, numbers stored as text, or no match, and how to handle each.\n4. If there is a simpler route, such as a pivot table or a filter, mention it in a sentence or two.\n\nIf you use newer functions such as XLOOKUP or FILTER, also give a version that works in older releases.\nIf the layout is unclear and you cannot tell which column is which, ask me instead of assuming.",
        "variables": [
          {
            "name": "app",
            "description": "Excel, Google Sheets, WPS, etc.",
            "defaultValue": "Excel"
          },
          {
            "name": "layout",
            "description": "What each column holds and which rows contain data",
            "defaultValue": "Column A date, column B sales rep, column C amount, data in rows 2 to 500"
          },
          {
            "name": "goal",
            "description": "What you want to calculate",
            "defaultValue": "total amount per sales rep for October 2026"
          }
        ]
      }
    },
    {
      "id": "notice-writing",
      "title": "通知公告",
      "summary": "把零散信息写成一则重点清楚、读者知道该做什么的通知。",
      "prompt": "写一则{{通知类型}}通知，发给{{对象}}，发布渠道是{{渠道}}。\n\n【需要通知的信息】\n{{信息}}\n\n要求：\n1. 标题直接写事情，例如“关于 11 月 30 日办公室停电的通知”。\n2. 第一段说清：什么事，什么时间，影响谁，大家需要做什么。\n3. 细节用编号列出：时间、地点、流程、联系人等。\n4. 读者要做的动作单独成段放在最后，以“请大家……”开头。\n5. 只写信息里给出的内容。时间、地点、联系人缺失的，用【待补充】标出，不要编。\n6. 篇幅适合发布渠道：群消息控制在 200 字以内，邮件和公告栏可以写完整。",
      "variables": [
        {
          "name": "通知类型",
          "description": "放假、会议、制度变更、活动等",
          "defaultValue": "活动报名"
        },
        {
          "name": "对象",
          "description": "通知发给谁",
          "defaultValue": "全体员工"
        },
        {
          "name": "渠道",
          "description": "在哪里发布",
          "defaultValue": "企业微信群"
        },
        {
          "name": "信息",
          "description": "要通知的事实，一行一条",
          "defaultValue": ""
        }
      ],
      "category": "office",
      "tags": [
        "通知",
        "行政"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Announcement notice",
        "summary": "Turns scattered details into a clear announcement that tells readers what to do.",
        "prompt": "Write a {{notice_type}} announcement for {{audience}}, to be posted in {{channel}}.\n\n[Details]\n{{details}}\n\nRequirements:\n1. The title states the matter directly, for example \"Office power outage on November 30\".\n2. The first paragraph covers what is happening, when, who is affected, and what people need to do.\n3. List the details as numbered items: time, place, steps, contact person.\n4. Put what readers need to do in its own final paragraph, starting with \"Please\".\n5. Use only the details given. Mark any missing time, place or contact as [To add]; do not make them up.\n6. Fit the length to the channel: under 120 words for a group chat, complete for email or a notice board.",
        "variables": [
          {
            "name": "notice_type",
            "description": "Holiday, meeting, policy change, event, etc.",
            "defaultValue": "event sign-up"
          },
          {
            "name": "audience",
            "description": "Who it is for",
            "defaultValue": "all employees"
          },
          {
            "name": "channel",
            "description": "Where it will be posted",
            "defaultValue": "the team chat"
          },
          {
            "name": "details",
            "description": "The facts to announce, one per line",
            "defaultValue": ""
          }
        ]
      }
    },
    {
      "id": "prd-draft",
      "title": "PRD 初稿",
      "summary": "写出一份把已知讲清楚、把没想清楚的标出来的 PRD 初稿。",
      "prompt": "根据下面的信息写一份 PRD 初稿，给研发、设计和测试同事看。\n\n这是初稿，目的是把已知的讲清楚，把没想清楚的暴露出来。信息里没有的内容不要替我决定，统一写成【待确认：……】，并在文末汇总。\n\n【需求背景】\n{{需求背景}}\n\n【目标用户】\n{{目标用户}}\n\n【功能要点】\n{{功能要点}}\n\n文档结构：\n1. 背景与目标：要解决什么问题，怎样算做成了。写出衡量指标；信息里没有就写【待确认】。\n2. 用户与场景：2 到 3 个典型场景，每个写清是谁、在什么情况下、要完成什么。\n3. 功能需求：按 P0、P1、P2 分组。每条功能写明触发条件、主要流程、异常情况怎么处理。\n4. 本期不做：明确不包含的内容。\n5. 埋点与验收：上线后看哪些数据，怎样算通过验收。\n6. 待确认问题：表格 | 问题 | 影响什么 | 建议找谁确认 |。",
      "variables": [
        {
          "name": "需求背景",
          "description": "为什么要做，现在有什么问题",
          "defaultValue": ""
        },
        {
          "name": "目标用户",
          "description": "给谁用",
          "defaultValue": ""
        },
        {
          "name": "功能要点",
          "description": "想要的功能，一行一条",
          "defaultValue": ""
        }
      ],
      "category": "product-data",
      "tags": [
        "PRD",
        "需求文档"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "PRD first draft",
        "summary": "Writes a first-draft PRD that states what is known and flags what is still undecided.",
        "prompt": "Write a first-draft PRD from the information below for engineering, design and QA.\n\nThis is a first draft. Its job is to state clearly what is known and expose what has not been decided. Do not make decisions the information does not support; write them as [To confirm: ...] and collect them at the end.\n\n[Background]\n{{background}}\n\n[Target users]\n{{target_users}}\n\n[Feature points]\n{{features}}\n\nDocument structure:\n1. Background and goals: the problem to solve and how we will know it worked. Name the metrics; if none were given, write [To confirm].\n2. Users and scenarios: 2 to 3 typical scenarios, each saying who, in what situation, trying to do what.\n3. Functional requirements: grouped as P0, P1 and P2. For each feature, give the trigger, the main flow, and how errors are handled.\n4. Out of scope: what this release explicitly leaves out.\n5. Tracking and acceptance: which data to watch after launch and what counts as passing acceptance.\n6. Open questions: a table | Question | What it affects | Who should confirm |.",
        "variables": [
          {
            "name": "background",
            "description": "Why this is needed and what is wrong today",
            "defaultValue": ""
          },
          {
            "name": "target_users",
            "description": "Who it is for",
            "defaultValue": ""
          },
          {
            "name": "features",
            "description": "The features you want, one per line",
            "defaultValue": ""
          }
        ]
      }
    },
    {
      "id": "user-stories",
      "title": "用户故事与验收标准",
      "summary": "把功能描述拆成小而可测的用户故事，每个都带验收标准。",
      "prompt": "把下面的功能描述拆成用户故事，并给每个故事写验收标准。\n\n【功能描述】\n{{功能描述}}\n\n【用户角色】\n{{用户角色}}\n\n要求：\n1. 每个故事写成“作为……，我想要……，以便……”。“以便”后面写用户的真实目的，不写“提升体验”这类空话。\n2. 每个故事小到一个迭代内能做完；太大的继续拆，并说明拆分依据。\n3. 每个故事配 2 到 4 条验收标准，格式为“假如……，当……，那么……”，其中至少一条是异常或边界情况。\n4. 功能描述里没说清的规则不要自己定，在故事下面列为“待澄清”。\n\n输出：按编号列出故事，最后用一张表汇总 | 编号 | 故事标题 | 大小（小 / 中 / 大） | 依赖 |。",
      "variables": [
        {
          "name": "功能描述",
          "description": "要做的功能，越具体越好",
          "defaultValue": ""
        },
        {
          "name": "用户角色",
          "description": "会用到这个功能的人，有几类写几类",
          "defaultValue": "普通会员、店铺管理员"
        }
      ],
      "category": "product-data",
      "tags": [
        "用户故事",
        "验收标准",
        "敏捷"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "User stories with acceptance criteria",
        "summary": "Breaks a feature description into small, testable user stories with acceptance criteria.",
        "prompt": "Break the feature description below into user stories and write acceptance criteria for each.\n\n[Feature description]\n{{feature}}\n\n[User roles]\n{{roles}}\n\nRequirements:\n1. Write each story as \"As a ..., I want ..., so that ...\". The \"so that\" states the user's real purpose, not filler like \"improve the experience\".\n2. Keep each story small enough to finish in one sprint. Split larger ones and explain the split.\n3. Give each story 2 to 4 acceptance criteria in \"Given ..., when ..., then ...\" form, at least one of them an error or edge case.\n4. Do not invent rules the description leaves open. List them under the story as \"Needs clarification\".\n\nOutput the stories in numbered order, then a summary table | # | Story title | Size (S / M / L) | Dependencies |.",
        "variables": [
          {
            "name": "feature",
            "description": "The feature to build, as specifically as possible",
            "defaultValue": ""
          },
          {
            "name": "roles",
            "description": "Who will use the feature; list each type",
            "defaultValue": "regular members, store admins"
          }
        ]
      }
    },
    {
      "id": "interview-guide",
      "title": "用户访谈提纲",
      "summary": "设计一份问真实行为、不带引导的用户访谈提纲。",
      "prompt": "为一次用户访谈设计提纲。访谈约 {{时长}} 分钟，受访者是{{受访者}}。\n\n【研究目标】\n{{研究目标}}\n\n设计原则：\n- 问过去发生过的具体行为，不问对未来的设想。例如问“上一次你是怎么……的”，不问“你会不会用……”。\n- 不问引导性问题，问题里不暗示答案，也不提我们的产品方案。\n- 每个主问题配 1 到 2 个追问，用来挖原因和细节。\n\n输出：\n1. 开场白：说明来意、时长和录音授权，约 80 字。\n2. 热身问题：2 个，了解受访者背景。\n3. 核心问题：按研究目标分组，共 8 到 12 个，每个注明对应哪个研究目标。\n4. 收尾问题：2 个，其中一个是“还有什么我没问到、但你觉得重要的”。\n5. 注意事项：3 条，提醒访谈者容易犯的错。",
      "variables": [
        {
          "name": "研究目标",
          "description": "这次访谈想弄清楚什么，一行一条",
          "defaultValue": ""
        },
        {
          "name": "受访者",
          "description": "什么样的用户",
          "defaultValue": "最近三个月在网上买过二手家电的人"
        },
        {
          "name": "时长",
          "description": "访谈多少分钟",
          "defaultValue": "45"
        }
      ],
      "category": "product-data",
      "tags": [
        "用户研究",
        "访谈"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "User interview guide",
        "summary": "Designs an interview guide that asks about real past behavior instead of leading questions.",
        "prompt": "Design a guide for a user interview of about {{minutes}} minutes with {{participant}}.\n\n[Research goals]\n{{research_goals}}\n\nPrinciples:\n- Ask about specific things people actually did in the past, not what they imagine doing. Ask \"Walk me through the last time you ...\", not \"Would you use ...\".\n- No leading questions. Do not hint at the answer or mention our product ideas.\n- Give each main question 1 to 2 follow-ups that dig into reasons and details.\n\nOutput:\n1. Opening: purpose, length and recording consent, about 50 words.\n2. Warm-up: 2 questions about the participant's background.\n3. Core questions: 8 to 12, grouped by research goal, each labeled with the goal it serves.\n4. Closing: 2 questions, one of them \"Is there anything I didn't ask that you think matters?\"\n5. Interviewer notes: 3 common mistakes to avoid.",
        "variables": [
          {
            "name": "research_goals",
            "description": "What you want to learn, one per line",
            "defaultValue": ""
          },
          {
            "name": "participant",
            "description": "What kind of user",
            "defaultValue": "someone who bought a used home appliance online in the last three months"
          },
          {
            "name": "minutes",
            "description": "Length in minutes",
            "defaultValue": "45"
          }
        ]
      }
    },
    {
      "id": "competitor-compare",
      "title": "竞品对比分析",
      "summary": "只根据你给的资料对比我方产品和竞品，找出机会和信息缺口。",
      "prompt": "根据我提供的资料，对比我们的产品和竞品。\n\n【我们的产品】\n{{我方产品}}\n\n【竞品资料】\n{{竞品资料}}\n\n【对比维度】\n{{对比维度}}\n\n规则：只用上面的资料。资料里没有的信息填“资料未提及”，不要凭印象补充竞品的价格、功能或数据。\n\n输出：\n1. 对比表：行是对比维度，列是各个产品，每格一句话。\n2. 各家定位：每个产品用一句话说清主要服务谁、靠什么取胜。\n3. 我们的机会：2 到 3 条，每条注明依据来自表中哪一格。\n4. 我们的风险：2 条。\n5. 信息缺口：要得出更可靠的结论，还需要补充哪些资料。",
      "variables": [
        {
          "name": "我方产品",
          "description": "你的产品介绍",
          "defaultValue": ""
        },
        {
          "name": "竞品资料",
          "description": "竞品的官网介绍、评测、价格等，注明是哪一家",
          "defaultValue": ""
        },
        {
          "name": "对比维度",
          "description": "想比较哪些方面",
          "defaultValue": "目标用户、核心功能、价格、上手难度、获客渠道"
        }
      ],
      "category": "product-data",
      "tags": [
        "竞品",
        "分析"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Competitor comparison",
        "summary": "Compares your product with competitors using only the material you provide.",
        "prompt": "Compare our product with its competitors using only the material I provide.\n\n[Our product]\n{{our_product}}\n\n[Competitor material]\n{{competitor_material}}\n\n[Dimensions]\n{{dimensions}}\n\nRule: use only the material above. Where it says nothing, write \"not in the material\". Do not fill in competitors' prices, features or numbers from memory.\n\nOutput:\n1. Comparison table: dimensions as rows, products as columns, one sentence per cell.\n2. Positioning: one sentence per product on who it mainly serves and how it wins.\n3. Our opportunities: 2 to 3, each citing the table cell it rests on.\n4. Our risks: 2.\n5. Information gaps: what else we would need to reach a more reliable conclusion.",
        "variables": [
          {
            "name": "our_product",
            "description": "A description of your product",
            "defaultValue": ""
          },
          {
            "name": "competitor_material",
            "description": "Competitor websites, reviews, pricing, etc., labeled by company",
            "defaultValue": ""
          },
          {
            "name": "dimensions",
            "description": "What to compare",
            "defaultValue": "target users, core features, pricing, learning curve, acquisition channels"
          }
        ]
      }
    },
    {
      "id": "feature-priority",
      "title": "需求优先级排序（RICE）",
      "summary": "用 RICE 公式给需求打分排序，并标出哪些数字是估计的。",
      "prompt": "用 RICE 方法给下面的需求排优先级。\n\nRICE 四项：\n- 覆盖：一个周期内会影响多少用户\n- 影响：对单个用户的影响程度，按 3、2、1、0.5、0.25 打分\n- 信心：对以上估计有多大把握，按 100%、80%、50% 选择\n- 投入：需要多少人月\n得分 = 覆盖 × 影响 × 信心 ÷ 投入\n\n【需求列表】\n{{需求列表}}\n\n【背景信息】\n{{背景信息}}\n\n规则：\n1. 需求列表里给了数据的直接用。没给的可以估计，但要在表里标“估”，信心最高按 50% 算。\n2. 不因为某个需求听起来重要就调高分数，一律按公式算。\n\n输出：\n1. 评分表：| 需求 | 覆盖 | 影响 | 信心 | 投入 | 得分 | 估计依据 |，按得分从高到低排列。\n2. 如果有强依赖、合规要求等让排序不该只看分数的情况，单独说明，不改分数。\n3. 对排序影响最大的 2 个估计值：如果估错了，排序会怎么变。",
      "variables": [
        {
          "name": "需求列表",
          "description": "每行一个需求，有数据就附上",
          "defaultValue": ""
        },
        {
          "name": "背景信息",
          "description": "周期、团队人数、当前目标等",
          "defaultValue": "一个季度，研发 4 人，本季目标是提高新用户留存"
        }
      ],
      "category": "product-data",
      "tags": [
        "优先级",
        "RICE",
        "规划"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Feature prioritization with RICE",
        "summary": "Scores and ranks features with the RICE formula and marks which numbers are estimates.",
        "prompt": "Prioritize the features below with RICE.\n\nThe four factors:\n- Reach: how many users it affects in one period\n- Impact: effect on a single user, scored 3, 2, 1, 0.5 or 0.25\n- Confidence: how sure we are of the estimates, 100%, 80% or 50%\n- Effort: person-months required\nScore = Reach × Impact × Confidence ÷ Effort\n\n[Feature list]\n{{features}}\n\n[Context]\n{{context}}\n\nRules:\n1. Use the numbers given in the list. Where none are given you may estimate, but mark the cell \"est.\" and cap confidence at 50%.\n2. Do not raise a score because a feature sounds important. Follow the formula.\n\nOutput:\n1. Score table: | Feature | Reach | Impact | Confidence | Effort | Score | Basis for estimates |, highest score first.\n2. Cases where the ranking should not rest on score alone, such as hard dependencies or compliance needs, noted separately without changing the scores.\n3. The 2 estimates that matter most to the ranking, and how the order changes if they are wrong.",
        "variables": [
          {
            "name": "features",
            "description": "One feature per line, with any data you have",
            "defaultValue": ""
          },
          {
            "name": "context",
            "description": "Time period, team size, current goal, etc.",
            "defaultValue": "one quarter, 4 engineers, goal is better new-user retention"
          }
        ]
      }
    },
    {
      "id": "data-insight",
      "title": "数据解读报告",
      "summary": "把一份数据读成结论和发现，分清哪些是数据显示、哪些是推测。",
      "prompt": "解读下面这份数据，写一份给{{读者}}看的简短分析。\n\n【业务背景】\n{{业务背景}}\n\n【数据】\n{{数据}}\n\n规则：\n1. 所有数字都从数据里算出来，并写清算法，例如“环比 = 本月 ÷ 上月 - 1”。算不出来的不写。\n2. 分清“数据显示”和“推测”。关于原因的判断一律标为推测，并说明需要什么数据来验证。\n3. 不把相关当成因果。\n4. 数据有缺失、异常值或口径问题，先指出来。\n\n输出：\n1. 一句话结论。\n2. 3 到 5 个发现：每个写现象、具体数字、可能原因（标注“推测”）。\n3. 下一步：2 到 3 条，建议再看什么数据或做什么动作。\n4. 数据问题：缺失、异常、口径不清的地方，没有就写“无”。\n\n如果数据读不懂，比如没有表头，先说明需要我补充什么。",
      "variables": [
        {
          "name": "数据",
          "description": "表格数据，可以直接从 Excel 粘贴",
          "defaultValue": ""
        },
        {
          "name": "业务背景",
          "description": "这是什么数据，关心什么问题",
          "defaultValue": "无，请根据数据本身判断"
        },
        {
          "name": "读者",
          "description": "报告给谁看",
          "defaultValue": "业务负责人"
        }
      ],
      "category": "product-data",
      "tags": [
        "数据分析",
        "报告"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Data readout",
        "summary": "Reads a dataset into a conclusion and findings, separating what the data shows from what is guessed.",
        "prompt": "Analyze the data below and write a short readout for {{reader}}.\n\n[Business context]\n{{context}}\n\n[Data]\n{{data}}\n\nRules:\n1. Derive every number from the data and show how, for example \"month-over-month = this month ÷ last month - 1\". If you cannot compute it, leave it out.\n2. Separate \"the data shows\" from \"hypothesis\". Any claim about causes is a hypothesis; say what data would test it.\n3. Do not treat correlation as causation.\n4. Point out missing values, outliers or unclear definitions first.\n\nOutput:\n1. One-sentence conclusion.\n2. 3 to 5 findings, each with the pattern, the specific numbers, and a possible cause labeled \"hypothesis\".\n3. Next steps: 2 to 3 suggestions for data to check or actions to take.\n4. Data issues: missing values, outliers, unclear definitions, or \"none\".\n\nIf the data cannot be read, for example it has no header row, tell me what to add first.",
        "variables": [
          {
            "name": "data",
            "description": "The table, pasted straight from a spreadsheet",
            "defaultValue": ""
          },
          {
            "name": "context",
            "description": "What the data is and what question you care about",
            "defaultValue": "none; work from the data itself"
          },
          {
            "name": "reader",
            "description": "Who will read the readout",
            "defaultValue": "the business owner"
          }
        ]
      }
    },
    {
      "id": "metric-tree",
      "title": "指标体系拆解",
      "summary": "把业务目标拆成有公式、有口径、能落到行动的指标树。",
      "prompt": "帮我把一个业务目标拆成指标树。\n\n【业务目标】\n{{业务目标}}\n\n【业务模式】\n{{业务模式}}\n\n拆解方法：\n1. 先选一个最能代表目标的核心指标，说明为什么选它，以及它可能被怎样“刷”出来。\n2. 把核心指标拆成 2 到 4 个可以相乘或相加的驱动指标，写出公式，例如“销售额 = 访客数 × 转化率 × 客单价”。\n3. 每个驱动指标再往下拆一层，拆到团队能直接采取行动为止。\n4. 每个指标写清定义和统计口径：分子、分母、时间范围、去重规则。\n\n输出：\n1. 指标树：用缩进列表表示层级。\n2. 指标定义表：| 指标 | 定义 | 口径 | 负责团队 | 能影响它的动作 |\n3. 2 个护栏指标：防止为了核心指标牺牲用户体验或长期价值。",
      "variables": [
        {
          "name": "业务目标",
          "description": "想达成的结果",
          "defaultValue": "提高线上课程的付费收入"
        },
        {
          "name": "业务模式",
          "description": "怎么赚钱，用户怎么用产品",
          "defaultValue": "用户免费试听后购买单门课程，部分人会续购"
        }
      ],
      "category": "product-data",
      "tags": [
        "指标",
        "数据分析",
        "增长"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Metric tree breakdown",
        "summary": "Breaks a business goal into a metric tree with formulas, definitions and levers teams can pull.",
        "prompt": "Help me break a business goal into a metric tree.\n\n[Business goal]\n{{goal}}\n\n[Business model]\n{{business_model}}\n\nMethod:\n1. Pick one core metric that best represents the goal. Explain why, and how it could be gamed.\n2. Break the core metric into 2 to 4 driver metrics that multiply or add up to it, with the formula, for example \"Revenue = Visitors × Conversion rate × Average order value\".\n3. Break each driver down one more level, until a team can act on it directly.\n4. Define every metric precisely: numerator, denominator, time window, deduplication rule.\n\nOutput:\n1. The metric tree as an indented list.\n2. Definitions table: | Metric | Definition | How it is counted | Owning team | Actions that move it |\n3. 2 guardrail metrics that stop the team from hitting the core metric at the expense of user experience or long-term value.",
        "variables": [
          {
            "name": "goal",
            "description": "The outcome you want",
            "defaultValue": "grow paid revenue from online courses"
          },
          {
            "name": "business_model",
            "description": "How you make money and how users use the product",
            "defaultValue": "users take a free trial lesson, then buy individual courses; some buy again"
          }
        ]
      }
    },
    {
      "id": "survey-open-answers",
      "title": "问卷开放题归类",
      "summary": "把一堆开放题回答归成具体主题，统计占比并附上原话。",
      "prompt": "把下面的问卷开放题回答归类。题目是：“{{问题}}”\n\n步骤：\n1. 通读所有回答，归纳出 5 到 10 个主题。主题名要具体，例如“配送时间不稳定”，不用“体验问题”这种大类。\n2. 把每条回答归到一个或多个主题。归不进去的放进“其他”；没有内容的回答，例如“无”“还行”，单独计数。\n3. 统计每个主题的条数和占比，占比的分母是有效回答数。\n\n输出：\n1. 主题表：| 主题 | 条数 | 占比 | 一句话说明 | 原话举例（1 到 2 条） |，按条数从多到少排列。\n2. 有效回答数和无内容回答数。\n3. 值得注意的少数意见：条数不多但可能很重要的 1 到 3 条，说明理由。\n\n原话一字不改地照抄。不推测回答者没说出来的意思。\n输出语言与回答的语言一致。\n\n【回答】\n{{回答}}",
      "variables": [
        {
          "name": "问题",
          "description": "问卷上的题目原文",
          "defaultValue": "你觉得我们最需要改进的是什么？"
        },
        {
          "name": "回答",
          "description": "所有回答，一行一条",
          "defaultValue": ""
        }
      ],
      "category": "product-data",
      "tags": [
        "问卷",
        "用户反馈",
        "归类"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Code open-ended survey answers",
        "summary": "Groups open-ended survey answers into specific themes with counts, shares and verbatim quotes.",
        "prompt": "Code the open-ended survey answers below. The question was: \"{{question}}\"\n\nSteps:\n1. Read every answer and identify 5 to 10 themes. Name them specifically, such as \"delivery times are unpredictable\", not broad buckets like \"experience issues\".\n2. Assign each answer to one or more themes. Put answers that fit nowhere under \"Other\", and count empty answers such as \"none\" or \"it's fine\" separately.\n3. Count answers per theme and compute each theme's share, using the number of valid answers as the denominator.\n\nOutput:\n1. Theme table: | Theme | Count | Share | One-line description | Example quotes (1 to 2) |, sorted by count.\n2. Number of valid answers and number of empty ones.\n3. Minority views worth noticing: 1 to 3 themes with few mentions that may still matter, and why.\n\nQuote answers word for word. Do not read in meanings the respondents did not express.\nWrite in the same language as the answers.\n\n[Answers]\n{{answers}}",
        "variables": [
          {
            "name": "question",
            "description": "The survey question, word for word",
            "defaultValue": "What is the one thing we most need to improve?"
          },
          {
            "name": "answers",
            "description": "All answers, one per line",
            "defaultValue": ""
          }
        ]
      }
    },
    {
      "id": "code-review",
      "title": "代码审查",
      "summary": "只报会出错、有漏洞或难维护的真问题，并给出修改代码。",
      "prompt": "审查下面的{{语言}}代码，这次重点关注：{{关注点}}。\n\n只报真正的问题：会导致错误、有安全漏洞、有性能问题、明显难以维护的写法。缩进、命名这类风格偏好，只在严重影响阅读时才提。\n\n每个问题按这个格式写：\n- 严重程度：高 / 中 / 低\n- 位置：函数名或行号\n- 问题：哪里不对，在什么输入或情况下会出错\n- 修改建议：改后的代码片段\n\n按严重程度从高到低排列。最后用一两句话说明这段代码整体能不能合并。\n代码调用了没给出的函数、缺少上下文无法判断时，列为“需要确认的假设”，不猜它的行为。\n没有发现问题就直接说明，不为凑数挑刺。\n\n【代码】\n{{代码}}",
      "variables": [
        {
          "name": "代码",
          "description": "要审查的代码或 diff",
          "defaultValue": ""
        },
        {
          "name": "语言",
          "description": "编程语言或框架",
          "defaultValue": "TypeScript"
        },
        {
          "name": "关注点",
          "description": "这次最在意什么",
          "defaultValue": "正确性和边界情况"
        }
      ],
      "category": "coding",
      "tags": [
        "代码审查",
        "质量"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Code review",
        "summary": "Reports only real bugs, security holes and maintainability problems, each with a code fix.",
        "prompt": "Review the {{language}} code below. Focus this time on: {{focus}}.\n\nReport only real problems: bugs, security holes, performance issues, and code that will clearly be hard to maintain. Mention style preferences like formatting or naming only when they seriously hurt readability.\n\nFormat each issue as:\n- Severity: high / medium / low\n- Location: function name or line number\n- Problem: what is wrong and for which input or situation it fails\n- Fix: the revised code snippet\n\nOrder issues from most to least severe. End with one or two sentences on whether the code is ready to merge.\nIf the code calls functions that are not shown and you cannot judge without them, list those under \"Assumptions to confirm\" rather than guessing their behavior.\nIf you find no problems, say so. Do not nitpick to fill space.\n\n[Code]\n{{code}}",
        "variables": [
          {
            "name": "code",
            "description": "The code or diff to review",
            "defaultValue": ""
          },
          {
            "name": "language",
            "description": "Language or framework",
            "defaultValue": "TypeScript"
          },
          {
            "name": "focus",
            "description": "What matters most this time",
            "defaultValue": "correctness and edge cases"
          }
        ]
      }
    },
    {
      "id": "explain-code",
      "title": "解释陌生代码",
      "summary": "按执行顺序讲清一段代码在做什么，深浅按你的水平来。",
      "prompt": "帮我读懂下面这段代码。我的水平：{{我的水平}}。\n\n按顺序输出：\n1. 一句话说明这段代码做什么。\n2. 执行流程：按代码实际运行的顺序分步说明，每步对应哪几行。\n3. 关键点：不好懂的语法、库函数或写法，逐个解释。按我的水平决定讲多深，我已经会的不用讲。\n4. 一个例子：给一个具体输入，追踪它在代码里怎么变化，最后得到什么输出。\n5. 值得注意的地方：潜在问题或隐含的假设，没有就跳过。\n\n只解释代码里有的东西。用到代码外部的函数或配置时，说明“这里依赖外部的 X，具体行为要看它的实现”，不要猜。\n\n【代码】\n{{代码}}",
      "variables": [
        {
          "name": "代码",
          "description": "看不懂的代码",
          "defaultValue": ""
        },
        {
          "name": "我的水平",
          "description": "你懂到什么程度",
          "defaultValue": "学过 Python 基础，没用过这个框架"
        }
      ],
      "category": "coding",
      "tags": [
        "读代码",
        "入门"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Explain unfamiliar code",
        "summary": "Walks through what a piece of code does in execution order, pitched at your level.",
        "prompt": "Help me understand the code below. My level: {{my_level}}.\n\nOutput in order:\n1. One sentence on what the code does.\n2. Execution flow: step by step in the order the code actually runs, with the lines each step covers.\n3. Key points: explain each piece of tricky syntax, library call or idiom. Pitch the depth to my level and skip what I already know.\n4. A worked example: pick a concrete input and trace how it changes through the code to the output.\n5. Things to watch: potential problems or hidden assumptions. Skip this if there are none.\n\nExplain only what is in the code. Where it depends on functions or configuration that are not shown, say \"this depends on X, defined elsewhere; its behavior depends on that implementation\" instead of guessing.\n\n[Code]\n{{code}}",
        "variables": [
          {
            "name": "code",
            "description": "The code you want explained",
            "defaultValue": ""
          },
          {
            "name": "my_level",
            "description": "How much you already know",
            "defaultValue": "I know basic Python but have never used this framework"
          }
        ]
      }
    },
    {
      "id": "debug-error",
      "title": "报错排查",
      "summary": "根据报错和代码列出可能原因、验证办法和修复代码。",
      "prompt": "帮我排查一个报错。\n\n【报错信息】\n{{报错信息}}\n\n【相关代码】\n{{相关代码}}\n\n【运行环境和已经试过的办法】\n{{环境}}\n\n请这样分析：\n1. 用一句话解释这个报错在说什么。\n2. 列出 2 到 4 个可能原因，按可能性从高到低排列。每个原因写明依据：报错里的哪句话，或代码的哪一行。\n3. 每个原因给一个验证办法：运行什么命令、加什么日志、看哪个值，能确认或排除它。\n4. 给最可能的原因写出修复代码。\n\n不要一上来就让我重装依赖或重启。信息不够判断时，告诉我还需要提供什么。",
      "variables": [
        {
          "name": "报错信息",
          "description": "完整的报错和堆栈，不要只截一行",
          "defaultValue": ""
        },
        {
          "name": "相关代码",
          "description": "报错位置附近的代码",
          "defaultValue": ""
        },
        {
          "name": "环境",
          "description": "语言版本、系统、框架版本，以及已经试过什么",
          "defaultValue": "未提供"
        }
      ],
      "category": "coding",
      "tags": [
        "调试",
        "报错"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Debug an error",
        "summary": "Lists likely causes for an error with a way to verify each and a fix for the most likely one.",
        "prompt": "Help me track down an error.\n\n[Error message]\n{{error}}\n\n[Relevant code]\n{{code}}\n\n[Environment and what I have tried]\n{{environment}}\n\nWork through it like this:\n1. Explain in one sentence what the error is saying.\n2. List 2 to 4 possible causes, most likely first. For each, cite the evidence: the line of the error message or the line of code that points to it.\n3. For each cause, give one way to confirm or rule it out: a command to run, a log line to add, a value to inspect.\n4. Write the fix for the most likely cause.\n\nDo not open with \"reinstall your dependencies\" or \"restart\". If there is not enough information to judge, tell me what else to send.",
        "variables": [
          {
            "name": "error",
            "description": "The full error and stack trace, not just one line",
            "defaultValue": ""
          },
          {
            "name": "code",
            "description": "The code around where it fails",
            "defaultValue": ""
          },
          {
            "name": "environment",
            "description": "Language and framework versions, OS, and what you have already tried",
            "defaultValue": "not provided"
          }
        ]
      }
    },
    {
      "id": "write-unit-tests",
      "title": "写单元测试",
      "summary": "先列测试清单再写测试代码，覆盖正常、边界和异常情况。",
      "prompt": "为下面的代码写单元测试，使用 {{测试框架}}。\n\n先列清单，再写代码：\n1. 测试清单：表格 | 场景 | 输入 | 期望结果 | 类型 |。类型分正常、边界、异常三种，每种至少 2 个。\n2. 测试代码：每个测试只验证一件事，测试名直接写出被验证的行为，例如“金额为负时抛出错误”。\n\n原则：\n- 测调用者看得到的行为：返回值、抛出的错误、对外部的调用。不测私有变量和内部实现。\n- 需要模拟网络、数据库、时间等外部依赖时，说明为什么要模拟。\n- 不为了让测试通过去改被测代码。发现代码本身有缺陷时，在最后单独指出，并写一个会失败的测试把它暴露出来。\n\n【被测代码】\n{{代码}}",
      "variables": [
        {
          "name": "代码",
          "description": "要测试的函数或模块",
          "defaultValue": ""
        },
        {
          "name": "测试框架",
          "description": "测试框架和语言",
          "defaultValue": "Vitest"
        }
      ],
      "category": "coding",
      "tags": [
        "测试",
        "单元测试"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Write unit tests",
        "summary": "Plans test cases first, then writes tests covering normal, edge and error cases.",
        "prompt": "Write unit tests for the code below using {{test_framework}}.\n\nPlan first, then write code:\n1. Test plan: a table | Scenario | Input | Expected result | Type |. Types are normal, edge and error, with at least 2 of each.\n2. Test code: each test checks one thing, and its name states the behavior, such as \"throws when the amount is negative\".\n\nPrinciples:\n- Test behavior a caller can observe: return values, thrown errors, calls to outside systems. Do not test private state or internal details.\n- When you mock an external dependency such as the network, a database or the clock, say why.\n- Do not change the code under test to make tests pass. If you find a real bug, point it out at the end and write a failing test that exposes it.\n\n[Code under test]\n{{code}}",
        "variables": [
          {
            "name": "code",
            "description": "The function or module to test",
            "defaultValue": ""
          },
          {
            "name": "test_framework",
            "description": "Test framework and language",
            "defaultValue": "Vitest"
          }
        ]
      }
    },
    {
      "id": "sql-from-question",
      "title": "用中文问题写 SQL",
      "summary": "根据表结构把一个业务问题写成 SQL，并先说清你对问题的理解。",
      "prompt": "根据表结构写一条 {{数据库}} 的 SQL，回答这个问题：{{问题}}\n\n【表结构】\n{{表结构}}\n\n要求：\n1. 只用表结构里存在的表和字段，不假设其他字段。\n2. 问题里有歧义的地方，例如“活跃用户”怎么定义、时间按哪个时区，先列出你采用的理解，再写 SQL。\n3. SQL 加简短的中文注释，说明每一步在做什么。\n4. 处理好 NULL、重复数据和除以零。\n5. 只写查询，不写 UPDATE、DELETE 等会改动数据的语句。\n\n输出：你的理解（几条）、SQL、结果中每一列的含义。\n如果表结构里缺少回答问题必需的字段，直接说明缺什么，不要硬写。",
      "variables": [
        {
          "name": "数据库",
          "description": "MySQL、PostgreSQL、SQLite 等",
          "defaultValue": "MySQL 8"
        },
        {
          "name": "问题",
          "description": "想从数据里查什么",
          "defaultValue": "上个月每天的新注册用户数，以及其中当天就下单的人数"
        },
        {
          "name": "表结构",
          "description": "建表语句或字段列表",
          "defaultValue": ""
        }
      ],
      "category": "coding",
      "tags": [
        "SQL",
        "数据库",
        "查询"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Write SQL from a plain-language question",
        "summary": "Turns a business question into SQL against your schema, stating its assumptions first.",
        "prompt": "Write one {{database}} query that answers this question: {{question}}\n\n[Schema]\n{{schema}}\n\nRequirements:\n1. Use only tables and columns that exist in the schema. Do not assume others.\n2. Where the question is ambiguous, such as how \"active user\" is defined or which time zone to use, list the interpretation you chose before the SQL.\n3. Add short comments explaining each step.\n4. Handle NULLs, duplicates and division by zero.\n5. Write read-only queries. No UPDATE, DELETE or anything else that changes data.\n\nOutput: your interpretations, the SQL, and what each result column means.\nIf the schema lacks a column the question needs, say what is missing instead of forcing a query.",
        "variables": [
          {
            "name": "database",
            "description": "MySQL, PostgreSQL, SQLite, etc.",
            "defaultValue": "PostgreSQL 16"
          },
          {
            "name": "question",
            "description": "What you want to find out",
            "defaultValue": "new sign-ups per day last month, and how many of them ordered on the same day"
          },
          {
            "name": "schema",
            "description": "CREATE TABLE statements or a column list",
            "defaultValue": ""
          }
        ]
      }
    },
    {
      "id": "regex-helper",
      "title": "正则表达式助手",
      "summary": "根据正例和反例写出正则，并逐条验证每个例子是否匹配。",
      "prompt": "帮我写一个正则表达式，用在{{使用环境}}里。\n\n【要匹配什么】\n{{需求}}\n\n【应该匹配的例子】\n{{正例}}\n\n【不应该匹配的例子】\n{{反例}}\n\n输出：\n1. 正则表达式。\n2. 逐段解释每一部分的作用。\n3. 验证结果：把上面每个例子逐一列出，标明是否匹配、匹配到哪一部分。\n4. 已知局限：这个正则在哪些情况下会误判。\n\n如果正例和反例互相矛盾，指出矛盾，不要硬写。",
      "variables": [
        {
          "name": "使用环境",
          "description": "编程语言或工具，不同环境的语法略有区别",
          "defaultValue": "JavaScript"
        },
        {
          "name": "需求",
          "description": "用文字描述要匹配的内容",
          "defaultValue": "中国大陆手机号"
        },
        {
          "name": "正例",
          "description": "一行一个",
          "defaultValue": "13812345678\n+86 13912345678"
        },
        {
          "name": "反例",
          "description": "一行一个",
          "defaultValue": "12345678901\n1381234567"
        }
      ],
      "category": "coding",
      "tags": [
        "正则",
        "文本处理"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Regex helper",
        "summary": "Writes a regular expression from matching and non-matching examples and checks each one.",
        "prompt": "Write a regular expression for {{environment}}.\n\n[What it should match]\n{{requirement}}\n\n[Should match]\n{{should_match}}\n\n[Should not match]\n{{should_not_match}}\n\nOutput:\n1. The regex.\n2. A piece-by-piece explanation.\n3. Check results: list every example above, whether it matches, and which part matches.\n4. Known limits: cases where this regex gives the wrong answer.\n\nIf the two example lists contradict each other, point out the contradiction instead of forcing a pattern.",
        "variables": [
          {
            "name": "environment",
            "description": "Language or tool; regex syntax varies slightly between them",
            "defaultValue": "JavaScript"
          },
          {
            "name": "requirement",
            "description": "Describe what to match in words",
            "defaultValue": "US phone numbers in common formats"
          },
          {
            "name": "should_match",
            "description": "One per line",
            "defaultValue": "(415) 555-0132\n415-555-0132"
          },
          {
            "name": "should_not_match",
            "description": "One per line",
            "defaultValue": "555-0132\n(415) 555-01322"
          }
        ]
      }
    },
    {
      "id": "commit-message",
      "title": "写提交信息",
      "summary": "根据 diff 写出符合 Conventional Commits 格式的提交信息。",
      "prompt": "根据下面的代码改动写一条 Git 提交信息。\n\n格式（Conventional Commits）：\n- 第一行：类型(范围): 简述。类型从 feat、fix、refactor、docs、test、chore、perf 中选。简述用{{语言}}，不超过 50 个字符。\n- 空一行后写正文：为什么改、改了什么，每行不超过 72 个字符。格式调整这类简单改动可以不写正文。\n- 有不兼容的变更时，在末尾写 BREAKING CHANGE: 并说明影响。\n\n只描述 diff 里实际发生的改动，不根据文件名猜测意图。\n如果 diff 里混着几件不相关的事，建议拆成几个提交，分别给出提交信息。\n\n【diff】\n{{改动}}",
      "variables": [
        {
          "name": "改动",
          "description": "git diff 的输出",
          "defaultValue": ""
        },
        {
          "name": "语言",
          "description": "提交信息用什么语言",
          "defaultValue": "中文"
        }
      ],
      "category": "coding",
      "tags": [
        "Git",
        "提交信息"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Write a commit message",
        "summary": "Writes a Conventional Commits message from a diff.",
        "prompt": "Write a Git commit message for the change below.\n\nFormat (Conventional Commits):\n- First line: type(scope): summary. Pick the type from feat, fix, refactor, docs, test, chore, perf. Write the summary in {{language}}, 50 characters or fewer, in the imperative mood.\n- After a blank line, the body: why the change was made and what it does, wrapped at 72 characters. Trivial changes such as formatting can skip the body.\n- For breaking changes, end with BREAKING CHANGE: and describe the impact.\n\nDescribe only what the diff actually changes. Do not guess intent from file names.\nIf the diff mixes unrelated changes, suggest splitting it and give a message for each commit.\n\n[diff]\n{{diff}}",
        "variables": [
          {
            "name": "diff",
            "description": "Output of git diff",
            "defaultValue": ""
          },
          {
            "name": "language",
            "description": "Language for the commit message",
            "defaultValue": "English"
          }
        ]
      }
    },
    {
      "id": "refactor-plan",
      "title": "重构建议（不改行为）",
      "summary": "在外部行为不变的前提下，给出小步可验证的重构步骤。",
      "prompt": "对下面的代码给出重构建议。前提是外部行为完全不变：同样的输入，得到同样的输出和副作用。\n\n先判断这段代码最影响阅读和修改的 3 个问题，例如函数过长、逻辑重复、嵌套过深、命名含糊。\n\n然后给出重构步骤，每一步写：\n1. 做什么改动\n2. 为什么这样改\n3. 改完的代码\n4. 怎么确认行为没变：要跑的测试，或要对比的输出\n\n规则：\n- 按小步排列，每一步单独提交都能运行。\n- 不引入新依赖，不为“以后可能用到”增加抽象层。\n- 有些写法看着别扭但有原因，例如兼容旧接口，保留并说明。\n\n【代码】\n{{代码}}",
      "variables": [
        {
          "name": "代码",
          "description": "想重构的代码",
          "defaultValue": ""
        }
      ],
      "category": "coding",
      "tags": [
        "重构",
        "可维护性"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Refactoring plan without behavior change",
        "summary": "Proposes small, verifiable refactoring steps that keep external behavior identical.",
        "prompt": "Suggest how to refactor the code below. External behavior must not change: the same input gives the same output and side effects.\n\nFirst, name the 3 problems that most hurt reading and changing this code, such as long functions, duplicated logic, deep nesting or vague names.\n\nThen give the refactoring steps. For each step:\n1. The change\n2. Why\n3. The code after the change\n4. How to confirm behavior is unchanged: tests to run or outputs to compare\n\nRules:\n- Keep steps small; the code should run after each one is committed on its own.\n- Add no new dependencies and no abstraction layers for hypothetical future needs.\n- If something looks odd but has a reason, such as compatibility with an old interface, keep it and say why.\n\n[Code]\n{{code}}",
        "variables": [
          {
            "name": "code",
            "description": "The code you want to refactor",
            "defaultValue": ""
          }
        ]
      }
    },
    {
      "id": "api-doc",
      "title": "接口文档",
      "summary": "根据代码写出参数、响应、错误码和调用示例齐全的接口文档。",
      "prompt": "根据下面的代码为接口写文档，读者是{{读者}}。\n\n每个接口包含：\n1. 名称和一句话用途\n2. 请求：方法、路径、参数表 | 参数 | 位置 | 类型 | 必填 | 说明 |\n3. 响应：成功时的结构和示例；可能的错误码和触发条件\n4. 一个完整的 curl 调用示例\n\n规则：\n- 只写代码里看得出来的内容。参数的业务含义从代码看不出时，写【待补充说明】，不要编。\n- 示例数据用一看就是假的值，例如 user_123。\n- 输出 Markdown。\n\n【代码】\n{{代码}}",
      "variables": [
        {
          "name": "代码",
          "description": "路由、控制器或接口定义",
          "defaultValue": ""
        },
        {
          "name": "读者",
          "description": "谁会看这份文档",
          "defaultValue": "调用这些接口的前端工程师"
        }
      ],
      "category": "coding",
      "tags": [
        "API",
        "文档",
        "技术写作"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "API reference from code",
        "summary": "Writes API docs from code with parameters, responses, error codes and a call example.",
        "prompt": "Write API documentation from the code below for {{reader}}.\n\nFor each endpoint include:\n1. Name and a one-sentence purpose\n2. Request: method, path, and a parameter table | Parameter | In | Type | Required | Description |\n3. Response: the success shape with an example, plus possible error codes and what triggers them\n4. A complete curl example\n\nRules:\n- Document only what the code shows. If a parameter's business meaning cannot be read from the code, write [Description needed] instead of inventing one.\n- Use obviously fake example values such as user_123.\n- Output Markdown.\n\n[Code]\n{{code}}",
        "variables": [
          {
            "name": "code",
            "description": "Routes, controllers or API definitions",
            "defaultValue": ""
          },
          {
            "name": "reader",
            "description": "Who will read the docs",
            "defaultValue": "frontend engineers calling these endpoints"
          }
        ]
      }
    },
    {
      "id": "xiaohongshu-note",
      "title": "小红书种草笔记",
      "summary": "用你的真实体验写一篇像朋友分享、又不踩广告法的种草笔记。",
      "prompt": "写一篇小红书笔记，推荐{{产品}}。\n\n【真实信息】\n卖点：{{卖点}}\n我的使用体验：{{使用体验}}\n\n写法：\n1. 标题不超过 20 个字，写具体的使用场景或效果，可以带 1 个表情符号。\n2. 正文 300 到 500 字，第一人称，像跟朋友分享：先讲我遇到的问题，再讲怎么用上这个产品，最后讲用了以后的变化。\n3. 至少写一个缺点，或者说明不适合哪些人，让内容更可信。\n4. 结尾放 5 到 8 个话题标签。\n\n合规要求：\n- 不用“最”“第一”“国家级”这类绝对化用语。\n- 不写医疗或治疗效果，不承诺具体的效果数字。\n- 只写我提供的体验，不编造使用时长和前后对比数据。\n\n如果没有提供使用体验，先问我用下来的真实感受，不要替我编。",
      "variables": [
        {
          "name": "产品",
          "description": "产品名称和品类",
          "defaultValue": "一款便携挂脖风扇"
        },
        {
          "name": "卖点",
          "description": "产品的主要卖点",
          "defaultValue": "无叶设计不夹头发；三档风速；续航 8 小时；重 200 克"
        },
        {
          "name": "使用体验",
          "description": "你自己用下来的真实感受，好坏都写",
          "defaultValue": ""
        }
      ],
      "category": "marketing",
      "tags": [
        "小红书",
        "种草",
        "社交媒体"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Product recommendation post for social media",
        "summary": "Writes a friend-to-friend product recommendation post from your real experience, without hype.",
        "prompt": "Write a social media post recommending {{product}}, in the style of a Xiaohongshu or Instagram recommendation.\n\n[Real information]\nSelling points: {{selling_points}}\nMy experience using it: {{experience}}\n\nHow to write it:\n1. Headline under 12 words that names a specific use or result. One emoji is fine.\n2. Body of 150 to 250 words in the first person, like telling a friend: the problem I had, how I started using this, what changed.\n3. Include at least one downside or a type of person it does not suit; it makes the post believable.\n4. End with 5 to 8 hashtags.\n\nCompliance:\n- No superlatives like \"best ever\", \"number one\" or \"miracle\".\n- No medical or therapeutic claims, and no promised results with numbers.\n- Use only the experience I gave. Do not invent how long I used it or before-and-after figures.\n\nIf I gave no experience, ask me how it actually went instead of making it up.",
        "variables": [
          {
            "name": "product",
            "description": "Product name and category",
            "defaultValue": "a portable neck fan"
          },
          {
            "name": "selling_points",
            "description": "The main selling points",
            "defaultValue": "bladeless so it does not catch hair; three speeds; 8-hour battery; weighs 200 g"
          },
          {
            "name": "experience",
            "description": "How it really went for you, good and bad",
            "defaultValue": ""
          }
        ]
      }
    },
    {
      "id": "selling-points",
      "title": "产品卖点提炼",
      "summary": "用 FAB 方法从产品资料里提炼卖点，每条都注明出处。",
      "prompt": "从下面的产品资料里提炼卖点，目标客户是{{目标客户}}。\n\n用 FAB 的方法：属性（产品是什么、有什么），作用（这个属性能做到什么），益处（对这个客户意味着什么）。\n\n输出：\n1. 卖点表：| 属性 | 作用 | 对客户的益处 | 资料出处 |，5 到 8 行。出处写资料中的原句。\n2. 挑出最打动目标客户的 3 个卖点，按重要性排序，各写一句 20 字以内的宣传语。\n3. 一句话定位：这个产品给谁用，在什么场景下，比替代方案好在哪里。\n\n只用资料里的信息。资料没提到的参数和认证不要写；需要但缺少的信息列在最后。\n\n【产品资料】\n{{产品资料}}",
      "variables": [
        {
          "name": "产品资料",
          "description": "说明书、参数表、详情页文字都可以",
          "defaultValue": ""
        },
        {
          "name": "目标客户",
          "description": "主要卖给谁",
          "defaultValue": "租房的上班族"
        }
      ],
      "category": "marketing",
      "tags": [
        "卖点",
        "FAB",
        "定位"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Extract product selling points",
        "summary": "Pulls selling points out of product material with the FAB method, citing the source for each.",
        "prompt": "Extract selling points from the product material below for {{target_customer}}.\n\nUse FAB: Feature (what the product is or has), Advantage (what that feature makes possible), Benefit (what it means for this customer).\n\nOutput:\n1. Selling point table: | Feature | Advantage | Benefit to the customer | Source |, 5 to 8 rows. Source is the exact sentence from the material.\n2. The 3 points that will matter most to this customer, ranked, each with a tagline under 10 words.\n3. One-sentence positioning: who it is for, in what situation, and why it beats the alternatives.\n\nUse only the material. Leave out specs and certifications it does not mention, and list any missing information you needed at the end.\n\n[Product material]\n{{material}}",
        "variables": [
          {
            "name": "material",
            "description": "Manual, spec sheet or product page text",
            "defaultValue": ""
          },
          {
            "name": "target_customer",
            "description": "Who you mainly sell to",
            "defaultValue": "young professionals who rent"
          }
        ]
      }
    },
    {
      "id": "short-video-script",
      "title": "短视频口播脚本",
      "summary": "按秒数写出带画面、台词和字幕的短视频口播脚本。",
      "prompt": "写一条 {{时长}} 秒的短视频口播脚本，主题是{{主题}}，发在{{平台}}。\n\n结构：\n1. 开头 3 秒：一句话抛出观众关心的问题，或一个反常识的结论，让人停下来。\n2. 中段：讲 2 到 3 个要点，每个配一个具体例子或画面。\n3. 结尾：一句话总结，加一个明确的动作引导，例如关注，或在评论区回答一个问题。\n\n口播总字数按每秒约 4 个字控制。\n\n输出表格：| 时间 | 画面 / 镜头 | 口播台词 | 屏幕字幕 |\n字幕是口播里的关键词，不超过 12 个字。\n\n口播要口语化，像在对一个人说话。用到数据时只用补充信息里的。\n\n【补充信息】\n{{补充信息}}",
      "variables": [
        {
          "name": "主题",
          "description": "视频讲什么",
          "defaultValue": "租房时怎样一眼看出房子是否潮湿"
        },
        {
          "name": "时长",
          "description": "视频多少秒",
          "defaultValue": "60"
        },
        {
          "name": "平台",
          "description": "抖音、视频号、B站等",
          "defaultValue": "抖音"
        },
        {
          "name": "补充信息",
          "description": "要用到的事实、数据或产品信息；没有就写“无”",
          "defaultValue": "无"
        }
      ],
      "category": "marketing",
      "tags": [
        "短视频",
        "脚本",
        "口播"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Short video voiceover script",
        "summary": "Writes a timed short-video script with shots, voiceover lines and on-screen captions.",
        "prompt": "Write a {{seconds}}-second voiceover script for a short video about {{topic}}, to be posted on {{platform}}.\n\nStructure:\n1. First 3 seconds: one line that raises a question viewers care about or a counterintuitive claim, so they stop scrolling.\n2. Middle: 2 to 3 points, each with a concrete example or visual.\n3. End: a one-line wrap-up and a clear call to action, such as follow, or answer a question in the comments.\n\nBudget about 2.5 spoken words per second.\n\nOutput a table: | Time | Visual / shot | Voiceover | On-screen caption |\nCaptions are keywords from the voiceover, 6 words or fewer.\n\nKeep the voiceover conversational, as if talking to one person. Use numbers only from the extra information.\n\n[Extra information]\n{{extra_info}}",
        "variables": [
          {
            "name": "topic",
            "description": "What the video is about",
            "defaultValue": "how to spot a damp apartment at a viewing"
          },
          {
            "name": "seconds",
            "description": "Length in seconds",
            "defaultValue": "60"
          },
          {
            "name": "platform",
            "description": "TikTok, Reels, YouTube Shorts, etc.",
            "defaultValue": "TikTok"
          },
          {
            "name": "extra_info",
            "description": "Facts, data or product details to use; write \"none\" if there are none",
            "defaultValue": "none"
          }
        ]
      }
    },
    {
      "id": "event-copy",
      "title": "多渠道活动文案",
      "summary": "一次写好朋友圈、社群通知、海报文字和截止提醒四份活动文案。",
      "prompt": "为下面这场活动写一组宣传文案，用在不同渠道。\n\n【活动信息】\n{{活动信息}}\n\n【目标人群】\n{{目标人群}}\n\n输出四份：\n1. 朋友圈文案：80 字以内，口语化，结尾写清报名方式。\n2. 社群通知：分点列出时间、地点、内容、报名方式和名额，方便转发。\n3. 海报文字：主标题不超过 10 个字，副标题不超过 20 个字，另加 3 条亮点，每条不超过 12 个字。\n4. 截止前一天的提醒消息：50 字以内。\n\n所有文案里的时间、地点、价格、名额必须和活动信息一致。活动信息里缺少的关键项，例如报名方式，在对应位置写【待补充】。",
      "variables": [
        {
          "name": "活动信息",
          "description": "时间、地点、内容、价格、报名方式、名额等",
          "defaultValue": ""
        },
        {
          "name": "目标人群",
          "description": "想吸引谁来",
          "defaultValue": "附近社区的年轻家长"
        }
      ],
      "category": "marketing",
      "tags": [
        "活动",
        "社群",
        "朋友圈"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Event promotion copy for every channel",
        "summary": "Writes a social post, a group announcement, poster text and a deadline reminder for one event.",
        "prompt": "Write a set of promotional copy for the event below, one piece per channel.\n\n[Event details]\n{{event_details}}\n\n[Who we want to attract]\n{{audience}}\n\nWrite four pieces:\n1. Social media post: under 50 words, conversational, ending with how to sign up.\n2. Group chat announcement: time, place, what happens, how to sign up and how many spots, as a list that is easy to forward.\n3. Poster text: a headline of 6 words or fewer, a subheading of 12 words or fewer, and 3 highlights of 6 words or fewer each.\n4. Reminder the day before sign-ups close: under 30 words.\n\nTimes, places, prices and spot counts must match the event details exactly. If a key item such as how to sign up is missing, write [To add] in its place.",
        "variables": [
          {
            "name": "event_details",
            "description": "Time, place, content, price, how to sign up, number of spots",
            "defaultValue": ""
          },
          {
            "name": "audience",
            "description": "Who you want to come",
            "defaultValue": "young parents in the neighborhood"
          }
        ]
      }
    },
    {
      "id": "brand-slogan",
      "title": "品牌口号备选",
      "summary": "从四个方向给出 12 条品牌口号，并说明各自适合用在哪里。",
      "prompt": "为{{品牌}}想品牌口号。\n\n【品牌信息】\n做什么：{{业务}}\n想留给人的感觉：{{品牌调性}}\n主要客户：{{客户}}\n\n给出 12 条候选，分 4 个方向，每个方向 3 条：\n- 说清我们做什么\n- 说出客户得到的好处\n- 表达态度或价值观\n- 押韵或有节奏感，方便口头传播\n\n要求：每条不超过 {{字数}} 个字；不和知名品牌的口号雷同；不用“极致”“领先”“赋能”这类空词。\n每条后面用一句话说明适合用在哪里，例如门头、包装、广告片结尾。\n最后挑出你最推荐的 2 条，说明理由。",
      "variables": [
        {
          "name": "品牌",
          "description": "品牌名",
          "defaultValue": "山野咖啡"
        },
        {
          "name": "业务",
          "description": "卖什么、提供什么服务",
          "defaultValue": "社区里的自家烘焙咖啡馆"
        },
        {
          "name": "品牌调性",
          "description": "希望留给人的感觉",
          "defaultValue": "朴素、温暖、认真"
        },
        {
          "name": "客户",
          "description": "主要服务谁",
          "defaultValue": "附近的上班族和住户"
        },
        {
          "name": "字数",
          "description": "每条口号最多几个字",
          "defaultValue": "12"
        }
      ],
      "category": "marketing",
      "tags": [
        "品牌",
        "口号",
        "slogan"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Brand slogan options",
        "summary": "Gives 12 slogan options in four directions and says where each one works best.",
        "prompt": "Come up with slogans for {{brand}}.\n\n[About the brand]\nWhat it does: {{business}}\nThe feeling it should leave: {{brand_tone}}\nMain customers: {{customers}}\n\nGive 12 candidates in 4 directions, 3 each:\n- Say plainly what we do\n- Name the benefit the customer gets\n- Express an attitude or value\n- Rhyme or rhythm that makes it easy to repeat\n\nEach slogan has {{max_words}} words or fewer, does not echo a well-known brand's slogan, and avoids empty words like \"ultimate\", \"leading\" or \"empower\".\nAfter each, add one sentence on where it fits best, such as the shop sign, packaging or the end of an ad.\nFinish with your 2 top picks and why.",
        "variables": [
          {
            "name": "brand",
            "description": "Brand name",
            "defaultValue": "Hillside Coffee"
          },
          {
            "name": "business",
            "description": "What you sell or offer",
            "defaultValue": "a neighborhood café that roasts its own beans"
          },
          {
            "name": "brand_tone",
            "description": "The feeling you want to leave",
            "defaultValue": "unpretentious, warm, careful"
          },
          {
            "name": "customers",
            "description": "Who you mainly serve",
            "defaultValue": "people who live and work nearby"
          },
          {
            "name": "max_words",
            "description": "Maximum words per slogan",
            "defaultValue": "6"
          }
        ]
      }
    },
    {
      "id": "ad-words-check",
      "title": "广告用语自查",
      "summary": "找出营销文案里的绝对化用语和高风险说法，并给出改法。",
      "prompt": "检查下面这段营销文案里可能违反广告法规的用语。投放地区：{{地区}}；产品类别：{{产品类别}}。\n\n重点检查：\n- 绝对化用语：最、第一、顶级、唯一、100% 等\n- 无法证实的功效承诺和数据\n- 非医疗产品使用医疗、治疗相关的表述\n- 贬低他人或与他人比较\n- 特殊类别的特定禁用说法，例如化妆品、食品、保健品、教育培训、金融\n\n输出：\n1. 问题表：| 原文片段 | 风险类型 | 风险程度（高 / 中 / 低） | 建议改为 |\n2. 修改后的完整文案。\n\n这只是初步自查，不构成法律意见。拿不准的地方写“建议咨询法务”，不下定论。\n没有发现问题就说明“未发现明显风险用语”。\n\n【文案】\n{{文案}}",
      "variables": [
        {
          "name": "文案",
          "description": "要检查的营销文案",
          "defaultValue": ""
        },
        {
          "name": "地区",
          "description": "文案在哪里投放",
          "defaultValue": "中国大陆"
        },
        {
          "name": "产品类别",
          "description": "产品属于什么类别",
          "defaultValue": "护肤品"
        }
      ],
      "category": "marketing",
      "tags": [
        "广告法",
        "合规",
        "自查"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Ad copy compliance check",
        "summary": "Flags absolute claims and risky wording in marketing copy and suggests safer phrasing.",
        "prompt": "Check the marketing copy below for wording that may break advertising rules. Market: {{market}}. Product category: {{category}}.\n\nLook especially for:\n- Absolute claims: best, number one, only, guaranteed, 100%, etc.\n- Performance claims and numbers that cannot be substantiated\n- Medical or therapeutic language for a non-medical product\n- Disparaging or comparative claims about competitors\n- Wording restricted for specific categories such as cosmetics, food, supplements, education and finance\n\nOutput:\n1. Issue table: | Original snippet | Risk type | Risk level (high / medium / low) | Suggested rewrite |\n2. The full revised copy.\n\nThis is a first-pass self-check, not legal advice. Where you are unsure, write \"check with legal\" instead of ruling on it.\nIf you find nothing, say \"No obvious risky wording found.\"\n\n[Copy]\n{{copy}}",
        "variables": [
          {
            "name": "copy",
            "description": "The marketing copy to check",
            "defaultValue": ""
          },
          {
            "name": "market",
            "description": "Where the ad will run",
            "defaultValue": "United States"
          },
          {
            "name": "category",
            "description": "Product category",
            "defaultValue": "skincare"
          }
        ]
      }
    },
    {
      "id": "review-reply",
      "title": "差评回复",
      "summary": "替商家写一条先回应关切、该认就认、给出补救的评价回复。",
      "prompt": "帮商家回复一条顾客评价。店铺类型：{{店铺类型}}。\n\n【顾客评价】\n{{评价}}\n\n【实际情况】\n{{实际情况}}\n\n回复要求：\n1. 先回应顾客最在意的那一点，不先说客套话。\n2. 顾客说得对的地方直接承认，不找借口。有误会的地方只用“实际情况”里的事实说明，不和顾客争对错。\n3. 给出具体的补救或改进措施，只写实际情况里提到、真能做到的。\n4. 100 到 150 字，语气真诚，像店长本人在说话，不用“亲”“小店”这类客服腔。\n5. 公开回复里不提顾客的个人信息和订单细节。\n\n给出 2 个版本：一个更简短，一个更详细。",
      "variables": [
        {
          "name": "评价",
          "description": "顾客的原话",
          "defaultValue": ""
        },
        {
          "name": "实际情况",
          "description": "你了解到的经过，以及能提供的补救",
          "defaultValue": "未提供"
        },
        {
          "name": "店铺类型",
          "description": "什么店",
          "defaultValue": "外卖餐厅"
        }
      ],
      "category": "marketing",
      "tags": [
        "评价",
        "客服",
        "口碑"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "Reply to a negative review",
        "summary": "Writes a business owner's reply that addresses the customer's main concern, owns mistakes and offers a fix.",
        "prompt": "Help a business reply to a customer review. Type of business: {{business_type}}.\n\n[The review]\n{{review}}\n\n[What actually happened]\n{{facts}}\n\nRequirements:\n1. Respond first to what the customer cares about most. No opening pleasantries.\n2. Admit what they got right without excuses. Where there is a misunderstanding, explain using only the facts above, and do not argue about who was right.\n3. Offer a concrete remedy or improvement, but only ones mentioned in the facts that you can actually deliver.\n4. 60 to 100 words, sincere, sounding like the owner rather than a support script.\n5. Keep personal details and order information out of the public reply.\n\nGive 2 versions: one shorter, one more detailed.",
        "variables": [
          {
            "name": "review",
            "description": "The customer's exact words",
            "defaultValue": ""
          },
          {
            "name": "facts",
            "description": "What you found out and what you can offer",
            "defaultValue": "not provided"
          },
          {
            "name": "business_type",
            "description": "What kind of business",
            "defaultValue": "a takeout restaurant"
          }
        ]
      }
    },
    {
      "id": "product-title",
      "title": "电商商品标题",
      "summary": "按搜索习惯写出 5 个不夸大、不堆词的商品标题。",
      "prompt": "为{{平台}}上的一件商品写标题。\n\n【商品信息】\n{{商品信息}}\n\n标题规则：\n1. 不超过 {{字数}} 个字。\n2. 结构：核心品类词 + 关键属性（材质、规格、功能）+ 适用人群或场景。顾客最可能搜的词放在前面。\n3. 只用商品信息里的属性，不写没有的认证、销量和功能。\n4. 不用“爆款”“最”“第一”这类词，不重复堆关键词。\n\n输出 5 个标题，每个下面用一句话说明它侧重哪类搜索人群。最后列出用到的关键词，按重要性排序。",
      "variables": [
        {
          "name": "商品信息",
          "description": "品类、材质、规格、功能、适用人群等",
          "defaultValue": ""
        },
        {
          "name": "平台",
          "description": "淘宝、京东、拼多多、亚马逊等",
          "defaultValue": "淘宝"
        },
        {
          "name": "字数",
          "description": "标题最多多少字",
          "defaultValue": "30"
        }
      ],
      "category": "marketing",
      "tags": [
        "电商",
        "标题",
        "搜索"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": {
        "title": "E-commerce product title",
        "summary": "Writes 5 search-friendly product titles without hype or keyword stuffing.",
        "prompt": "Write titles for a product listing on {{platform}}.\n\n[Product details]\n{{product_details}}\n\nRules:\n1. {{max_characters}} characters or fewer.\n2. Structure: core product type + key attributes (material, size, function) + who or what it is for. Put the terms shoppers most likely search for first.\n3. Use only attributes from the product details. No certifications, sales figures or features it does not have.\n4. No \"best seller\", \"best\" or \"#1\", and no repeated keywords.\n\nGive 5 titles, each followed by one sentence on which kind of shopper search it targets. Finish with the keywords you used, most important first.",
        "variables": [
          {
            "name": "product_details",
            "description": "Type, material, size, function, intended users, etc.",
            "defaultValue": ""
          },
          {
            "name": "platform",
            "description": "Amazon, Etsy, Shopify store, etc.",
            "defaultValue": "Amazon"
          },
          {
            "name": "max_characters",
            "description": "Maximum title length in characters",
            "defaultValue": "150"
          }
        ]
      }
    }
  ],
  "learn": []
}
