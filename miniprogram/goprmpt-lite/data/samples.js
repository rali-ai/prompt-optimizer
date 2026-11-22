// 由 scripts/build-lite-samples.mjs 从提示词库生成，请勿手改。改数据后运行：pnpm miniprogram:data
module.exports = [
  {
    "id": "article-from-outline",
    "category": "writing",
    "zh": {
      "title": "按提纲写成文章",
      "prompt": "请按下面的提纲写一篇文章，发表在{{发布平台}}，读者是{{读者}}。\n\n这不是自由发挥：提纲里的每个要点都要写到，顺序不变，也不要另加提纲里没有的大段落。素材里给出的事实、数据和例子优先使用；需要举例而素材里没有时，可以用常识性的例子，但不要编造具体数字、人名和引语。\n\n写法要求：\n1. 开头两三句直接进入主题，不写“随着时代的发展”这类铺垫。\n2. 每个要点写成一个小节，配一个小标题；每节先给观点，再用例子或数据支撑。\n3. 每段不超过 150 字，少用排比和感叹句。\n4. 结尾用一段话收束全文，可以给读者一个具体的行动建议，不喊口号。\n5. 全文约 {{字数}} 字，语气{{语气}}。\n\n输出：1 个标题，加正文。不要输出写作说明。\n如果提纲少于 2 个要点，先列出需要我补充的信息，不要开始写。\n\n【提纲】\n{{提纲}}\n\n【素材】\n{{素材}}"
    },
    "en": {
      "title": "Turn an outline into an article",
      "prompt": "Write an article from the outline below. It will be published on {{platform}} for {{audience}}.\n\nStick to the outline: cover every point in the given order, and do not add major sections that are not in it. Use the facts, data and examples from the source material first. If you need an example the material does not provide, a common-knowledge example is fine, but do not invent specific numbers, names or quotes.\n\nHow to write it:\n1. Get to the topic within the first two or three sentences. No \"In today's fast-paced world\" openers.\n2. Give each outline point its own section with a subheading. Open each section with the claim, then support it with an example or data.\n3. Keep paragraphs under 100 words. Go easy on rhetorical lists and exclamation marks.\n4. End with one paragraph that ties the piece together. A concrete next step for the reader is welcome; slogans are not.\n5. Aim for about {{word_count}} words in a {{tone}} tone.\n\nOutput one title and the article. Do not explain your writing choices.\nIf the outline has fewer than 2 points, list what you need from me instead of writing.\n\n[Outline]\n{{outline}}\n\n[Source material]\n{{material}}"
    }
  },
  {
    "id": "weekly-report",
    "category": "office",
    "zh": {
      "title": "周报生成器",
      "prompt": "把下面的工作记录整理成一份周报，发给{{汇报对象}}。\n\n只用记录里的事实：不补充没写的成果，不改动数字和人名。\n\n输出结构：\n1. 一句话总结：本周最重要的一个结果，30 字以内。\n2. 本周完成：每条一句话，以动词开头，有数据就带上数据。\n3. 进行中：每条写当前进度和预计完成时间。记录里看不出进度的写“进度未写明”，没有时间的写“时间待定”。\n4. 下周计划：只整理记录里提到的后续安排，没有提到就写“待补充”。\n5. 需要协助：写清需要谁做什么，没有就写“无”。\n\n语气平实，不用“圆满完成”“大力推进”这类空词。全文不超过 {{字数上限}} 字。\n如果记录是空的，或者看不出做过什么，只回复：“请先贴上本周的工作记录。”\n\n【本周工作记录】\n{{记录}}"
    },
    "en": {
      "title": "Weekly report generator",
      "prompt": "Turn the work notes below into a weekly report for {{recipient}}.\n\nUse only facts from the notes. Do not add accomplishments, and do not change numbers or names.\n\nStructure:\n1. One-line summary: the single most important result this week, under 20 words.\n2. Done this week: one sentence per item, starting with a verb, with numbers where the notes have them.\n3. In progress: current status and expected completion for each. If the notes do not show progress, write \"status not stated\"; if there is no date, write \"date TBD\".\n4. Next week: only plans mentioned in the notes. If none are mentioned, write \"to be added\".\n5. Need help with: who you need and for what, or \"none\".\n\nKeep the tone plain. Skip filler like \"successfully delivered\" or \"actively driving\". Keep the whole report under {{max_words}} words.\nIf the notes are empty or show no work, reply only: \"Please paste this week's work notes first.\"\n\n[This week's notes]\n{{notes}}"
    }
  },
  {
    "id": "translate-natural",
    "category": "translate",
    "zh": {
      "title": "地道翻译",
      "prompt": "把下面的原文翻译成{{目标语言}}，读者是{{读者}}。\n\n目标是让读者觉得这本来就是用{{目标语言}}写的：\n1. 先理解整段意思，再按目标语言的习惯重新组织句子，不逐字对应。\n2. 习语、俗语和文化梗，换成目标语言里意思相近的说法；找不到对应说法就意译，并加译注。\n3. 人名、品牌名、产品名保持原样，有通行译名的用通行译名。\n4. 数字、日期、单位准确，按目标语言的书写习惯写。\n5. 语气与原文一致：原文正式就正式，原文随意就随意。\n\n输出：\n- 译文\n- 译注：只列意译或拿不准的地方，每条写“原文｜译法｜理由”，没有就写“无”。\n\n【原文】\n{{原文}}"
    },
    "en": {
      "title": "Natural translation",
      "prompt": "Translate the text below into {{target_language}} for {{audience}}.\n\nThe goal is for readers to feel it was written in {{target_language}} to begin with:\n1. Understand each passage as a whole, then rebuild the sentences the way the target language would say them. Do not map word for word.\n2. Replace idioms, sayings and cultural references with close equivalents. If there is none, translate the meaning and add a translator's note.\n3. Keep names of people, brands and products as they are, unless there is an established translation.\n4. Get numbers, dates and units exactly right, and format them the way the target language does.\n5. Match the register of the original: formal stays formal, casual stays casual.\n\nOutput:\n- The translation\n- Translator's notes: only where you translated loosely or were unsure, as \"original | translation | reason\". Write \"none\" if there are none.\n\n[Original]\n{{original}}"
    }
  },
  {
    "id": "opinion-essay",
    "category": "writing",
    "zh": {
      "title": "一个观点写成评论文章",
      "prompt": "把下面这个观点写成一篇评论文章。设想读者原本不同意这个观点，文章要让他愿意认真考虑。\n\n【观点】\n{{观点}}\n\n按这个顺序展开：\n1. 开头：用一个具体场景或现象引出观点，100 字以内。\n2. 前提：这个观点成立需要哪些前提，逐条写明。\n3. 论证：2 到 3 个理由。每个理由先说清背后的机制，也就是“为什么会这样”，再配一个例子。\n4. 反方：写出最有力的一条反对意见，认真回应。对方有道理的部分，直接承认。\n5. 结论：说明观点在什么条件下成立、什么条件下不成立，最后一句落到读者能做的事上。\n\n要求：全文约 {{字数}} 字；不用“众所周知”“毋庸置疑”；不确定准确的数据写成定性描述，不给具体数字。\n如果观点含糊到无法论证（比如只有一个词），先用一句话问我具体想表达什么立场。"
    },
    "en": {
      "title": "Turn an opinion into an op-ed",
      "prompt": "Turn the opinion below into an op-ed. Assume the reader currently disagrees; the piece should make them take the idea seriously.\n\n[Opinion]\n{{opinion}}\n\nStructure:\n1. Opening: introduce the opinion through a concrete scene or observation, under 80 words.\n2. Premises: list what has to be true for this opinion to hold.\n3. Arguments: 2 to 3 reasons. For each, first explain the mechanism, meaning why it works this way, then give an example.\n4. Counterargument: state the strongest objection and answer it honestly. Concede the parts it gets right.\n5. Conclusion: say when the opinion holds and when it does not, and end on something the reader can actually do.\n\nKeep it to about {{word_count}} words. Skip \"everyone knows\" and \"it goes without saying\". If you are not sure a statistic is accurate, describe the trend in words instead of giving a number.\nIf the opinion is too vague to argue (a single word, say), ask me one question about the position I want to take before writing."
    }
  },
  {
    "id": "meeting-minutes",
    "category": "office",
    "zh": {
      "title": "会议纪要",
      "prompt": "把下面的会议记录整理成会议纪要。会议主题：{{会议主题}}。\n\n只用记录里出现的内容。记录里没说清楚的照实标注，不替参会人做决定。\n\n输出结构：\n1. 会议结论：已经拍板的事项，每条一句话。没有就写“本次未形成结论”。\n2. 待办事项：表格 | 事项 | 负责人 | 截止时间 |。记录里没有负责人或时间的填“未指定”。\n3. 待定问题：讨论了但没有结论的问题，写明卡在哪里。\n4. 讨论要点：按议题分组，每组 2 到 4 条，只保留影响决定的观点，注明是谁提的。\n\n删掉寒暄、重复发言和跑题的闲聊。人名、数字、日期照原样保留。\n如果记录是语音转写，遇到明显的识别错误按上下文改正，并在最后列出改过的词。\n\n【会议记录】\n{{记录}}"
    },
    "en": {
      "title": "Meeting minutes",
      "prompt": "Turn the meeting notes below into minutes. Meeting topic: {{topic}}.\n\nUse only what appears in the notes. Where something was left unclear, record it as unclear; do not make decisions on the attendees' behalf.\n\nStructure:\n1. Decisions: items that were settled, one sentence each. If none, write \"No decisions this meeting\".\n2. Action items: a table | Task | Owner | Due date |. Use \"unassigned\" when the notes give no owner or date.\n3. Open questions: discussed but unresolved, with what is blocking each one.\n4. Discussion highlights: grouped by topic, 2 to 4 points per group, keeping only views that affected decisions, each attributed to whoever raised it.\n\nDrop small talk, repetition and off-topic chat. Keep names, numbers and dates exactly as given.\nIf the notes are a speech-to-text transcript, fix obvious recognition errors from context and list the words you changed at the end.\n\n[Meeting notes]\n{{notes}}"
    }
  },
  {
    "id": "translate-tech-doc",
    "category": "translate",
    "zh": {
      "title": "技术文档翻译",
      "prompt": "把下面的技术文档翻译成{{目标语言}}。\n\n以下内容原样保留，不翻译：\n- 代码块、行内代码、命令、文件路径、URL、配置项名、API 名\n- Markdown 格式：标题层级、列表、表格、链接\n- 程序占位符，例如 {name}、%s、$VAR\n\n术语处理：\n1. 术语表里的词，一律按表中译法。\n2. 表里没有的专业术语，用该领域的通行译法，第一次出现时在括号里附上原文。\n3. 同一个术语全文只用一种译法。\n\n【术语表】\n{{术语表}}\n\n输出译文全文。最后附一张“新增术语”表，列出你自己决定译法的术语，格式为“原文｜译法”，方便我补进术语表。\n\n【原文】\n{{原文}}"
    },
    "en": {
      "title": "Technical document translation",
      "prompt": "Translate the technical document below into {{target_language}}.\n\nLeave these exactly as they are:\n- Code blocks, inline code, commands, file paths, URLs, config keys and API names\n- Markdown structure: heading levels, lists, tables, links\n- Program placeholders such as {name}, %s and $VAR\n\nTerminology:\n1. Use the glossary's translation for every term it lists.\n2. For technical terms not in the glossary, use the standard translation in the field and put the original term in parentheses the first time it appears.\n3. Use one translation per term throughout.\n\n[Glossary]\n{{glossary}}\n\nOutput the full translation. Then add a \"New terms\" table listing terms whose translation you chose yourself, as \"original | translation\", so I can add them to the glossary.\n\n[Original]\n{{original}}"
    }
  },
  {
    "id": "short-story",
    "category": "writing",
    "zh": {
      "title": "短篇小说",
      "prompt": "写一篇短篇小说，约 {{字数}} 字。\n\n【设定】\n主角：{{主角}}\n主角想要什么，被什么挡住：{{冲突}}\n时间地点：{{场景}}\n结局方向：{{结局}}\n\n写作要求：\n1. 用{{视角}}叙述。\n2. 第一段就让主角处在一个具体的动作或对话里，不先介绍背景；背景在后文分散交代。\n3. 冲突至少升级一次：主角的第一次尝试失败，或者付出代价，之后才走向结局。\n4. 情绪靠动作、对话和环境细节表现，少写“他很难过”这类直接陈述。\n5. 对话符合人物身份，每个人说话的方式要有区别。\n6. 结尾停在一个画面或一句话上，不在最后总结道理。\n\n只输出标题和正文。"
    },
    "en": {
      "title": "Short story",
      "prompt": "Write a short story of about {{word_count}} words.\n\n[Setup]\nProtagonist: {{protagonist}}\nWhat they want and what stands in the way: {{conflict}}\nTime and place: {{setting}}\nEnding: {{ending}}\n\nGuidelines:\n1. Tell it in {{point_of_view}}.\n2. Open with the protagonist in the middle of an action or a conversation. Feed in backstory later, in small pieces.\n3. Escalate the conflict at least once: the first attempt fails or costs something before the story turns toward its ending.\n4. Show emotion through action, dialogue and setting rather than lines like \"she felt sad\".\n5. Give each character a distinct voice that fits who they are.\n6. End on an image or a line of dialogue. Do not spell out the moral.\n\nOutput only the title and the story."
    }
  },
  {
    "id": "work-email",
    "category": "office",
    "zh": {
      "title": "工作邮件",
      "prompt": "帮我写一封工作邮件。\n\n收件人：{{收件人}}\n这封邮件的目的：{{目的}}\n要写进去的信息：\n{{要点}}\n\n要求：\n1. 主题行写清事情和需要对方做的动作，不超过 25 个字。\n2. 第一段说明来意和需要对方做什么；有截止时间就写在这里。\n3. 背景和细节放在后面，用编号列出，每条一件事。\n4. 语气{{语气}}，不用“百忙之中”“不胜感激”这类套话。\n5. 只用我给的信息。缺少对方办这件事必需的信息（时间、地点、文件等）时，在邮件里用【待补充：……】标出。\n\n输出：主题行、正文、署名占位。"
    },
    "en": {
      "title": "Work email",
      "prompt": "Write a work email for me.\n\nRecipient: {{recipient}}\nPurpose: {{purpose}}\nInformation to include:\n{{points}}\n\nRequirements:\n1. The subject line names the matter and the action needed, in 10 words or fewer.\n2. The first paragraph says why I am writing and what I need from them, including any deadline.\n3. Background and details come after that, as a numbered list with one item per point.\n4. Keep the tone {{tone}}. No \"I hope this email finds you well\" or similar filler.\n5. Use only the information I gave. If something the recipient needs in order to act is missing, such as a time, place or file, mark it in the email as [To add: ...].\n\nOutput: subject line, body, signature placeholder."
    }
  },
  {
    "id": "polish-chinese",
    "category": "translate",
    "zh": {
      "title": "中文润色",
      "prompt": "润色下面这段中文，力度为“{{力度}}”。\n\n力度说明：\n- 轻：只改错别字、病句、标点和明显不通顺的地方。\n- 中：在“轻”的基础上，删掉重复和空话，调整语序，让句子更顺。\n- 重：可以重组段落和句子，但观点、事实和数据不变。\n\n无论哪种力度：\n- 不加原文没有的观点、例子和数据。\n- 保留作者的口吻，不把口语改成公文腔，也不加华丽辞藻。\n- 专有名词和引用的原话不动。\n\n输出两部分：\n1. 润色后的全文。\n2. 改动说明表：| 原句 | 改为 | 原因 |，只列有实质改动的句子，最多 15 条。\n\n如果原文已经不需要修改，直接回复“无需修改”，不要为改而改。\n\n【原文】\n{{原文}}"
    },
    "en": {
      "title": "Line edit without changing meaning",
      "prompt": "Edit the text below at the \"{{level}}\" level.\n\nLevels:\n- light: fix only typos, grammar, punctuation and clearly awkward phrasing.\n- medium: everything in light, plus cut repetition and filler and reorder clauses so sentences flow.\n- heavy: you may restructure paragraphs and sentences, but the ideas, facts and numbers stay the same.\n\nAt every level:\n- Add no ideas, examples or data that are not in the original.\n- Keep the author's voice. Do not turn casual writing into corporate prose or add flourishes.\n- Leave proper nouns and quoted material untouched.\n\nOutput:\n1. The edited text.\n2. A change log: | Original | Revised | Why |, only for substantive changes, at most 15 rows.\n\nIf the text needs no changes, just say \"No changes needed.\" Do not edit for the sake of editing.\n\n[Original]\n{{original}}"
    }
  },
  {
    "id": "headline-options",
    "category": "writing",
    "zh": {
      "title": "文章标题备选",
      "prompt": "为下面这篇文章起标题，发布在{{平台}}。\n\n先用一句话概括文章真正讲了什么，再给出 10 个标题，覆盖下面 5 种写法，每种 2 个：\n- 直接说结论\n- 提出读者关心的问题\n- 用具体数字或细节\n- 点出读者的身份或场景\n- 制造反差\n\n规则：\n- 标题里的信息必须能在正文中找到，不夸大，不承诺正文没有的内容。\n- 不用“震惊”“必看”“绝了”这类词，不堆感叹号。\n- 每个标题不超过 {{字数上限}} 个字。\n\n输出格式：\n一句话概括：……\n| 序号 | 标题 | 写法 | 适合的情况 |\n最后用一句话说你最推荐哪一个，以及理由。\n\n【正文】\n{{正文}}"
    },
    "en": {
      "title": "Headline options",
      "prompt": "Write headlines for the article below, which will run on {{platform}}.\n\nFirst summarize in one sentence what the article actually says. Then give 10 headlines, two in each of these five styles:\n- State the conclusion\n- Ask a question the reader cares about\n- Lead with a specific number or detail\n- Name the reader's role or situation\n- Set up a contrast\n\nRules:\n- Every claim in a headline must be supported by the article. No exaggeration, no promises the article does not keep.\n- No \"shocking\" or \"you won't believe\", and no stacked exclamation marks.\n- Keep each headline to {{max_length}} words or fewer.\n\nFormat:\nOne-sentence summary: ...\n| # | Headline | Style | Works best when |\nFinish with one sentence naming your top pick and why.\n\n[Article]\n{{article}}"
    }
  },
  {
    "id": "reply-difficult-message",
    "category": "office",
    "zh": {
      "title": "回复棘手消息",
      "prompt": "我收到一条不好回的消息，请帮我写回复。\n\n【对方的消息】\n{{对方消息}}\n\n【我的情况和立场】\n{{我的立场}}\n\n【底线】\n{{底线}}\n\n先用两三句话分析：对方真正想要什么，哪句话最需要回应，哪句可以不接。\n\n然后写 3 个版本的回复：\n- 版本 A：温和。先认可对方的处境，再说明我的立场。\n- 版本 B：直接。简短说明能做什么、不能做什么。\n- 版本 C：给替代方案，把讨论引到双方都能接受的方向。\n\n每个版本都守住底线，不做我没同意的承诺，不指责对方。长度适合在{{渠道}}里发送。"
    },
    "en": {
      "title": "Reply to a difficult message",
      "prompt": "I got a message that is hard to answer. Help me reply.\n\n[Their message]\n{{their_message}}\n\n[My situation and position]\n{{my_position}}\n\n[My bottom line]\n{{bottom_line}}\n\nFirst, in two or three sentences: what they actually want, which line most needs a response, and which can be left alone.\n\nThen write 3 replies:\n- A, warm: acknowledge their situation first, then state my position.\n- B, direct: briefly say what I can and cannot do.\n- C, alternative: offer another option and steer toward something we can both accept.\n\nEvery version holds my bottom line, makes no promises I have not agreed to, and blames no one. Keep the length right for {{channel}}."
    }
  },
  {
    "id": "academic-english-polish",
    "category": "translate",
    "zh": {
      "title": "学术英文润色",
      "prompt": "润色下面这段英文学术写作。研究领域是{{领域}}，用途是{{用途}}。\n\n修改原则：\n1. 改正语法、拼写、冠词、时态和主谓一致问题。\n2. 表达更简洁准确：删冗余，去掉口语化用词，过长的句子拆开。\n3. 遵循该领域常见的学术写法，例如方法部分用过去时，陈述公认结论用现在时。\n4. 不改动论点、数据、引用和术语，不添加原文没有的结论。\n5. 读不懂作者意思的句子，保留原句并标出来，不要猜。\n\n输出：\n1. Revised text：润色后的英文全文。\n2. 修改说明：用中文列出最重要的 5 到 8 处修改，每条写“原文片段 → 修改后 → 原因”。\n3. 需要作者确认：意思不明确而没有改动的句子，没有就写“无”。\n\n【原文】\n{{原文}}"
    },
    "en": {
      "title": "Academic English polishing",
      "prompt": "Polish the academic English passage below. Field: {{field}}. Purpose: {{purpose}}.\n\nPrinciples:\n1. Fix grammar, spelling, articles, tense and subject-verb agreement.\n2. Make it concise and precise: cut redundancy, replace informal wording, split overlong sentences.\n3. Follow the conventions of the field, such as past tense for methods and present tense for established findings.\n4. Do not change claims, data, citations or terminology, and add no conclusions.\n5. If you cannot tell what a sentence means, leave it as is and flag it. Do not guess.\n\nOutput:\n1. Revised text: the full polished passage.\n2. Key edits: the 5 to 8 most important changes, each as \"original fragment | revised | reason\".\n3. For the author to confirm: unclear sentences you left unchanged, or \"none\".\n\n[Original]\n{{original}}"
    }
  },
  {
    "id": "rewrite-for-audience",
    "category": "writing",
    "zh": {
      "title": "换个读者重写",
      "prompt": "把下面的内容改写给{{目标读者}}看。读者看完要能{{用途}}。\n\n动笔前先想清楚三件事，不用写出来：这类读者已经知道什么，最关心什么，会在哪里看不懂。\n\n规则：\n1. 事实、数字和结论保持不变，不加原文没有的信息。\n2. 读者不熟悉的术语换成日常说法；必须保留的术语，第一次出现时用一句话解释。\n3. 按读者最关心的顺序重新排列内容，不必沿用原文顺序。\n4. 删掉对这类读者没用的细节。\n5. 篇幅约为原文的{{篇幅}}。\n\n先输出改写后的全文，再用不超过 3 条说明删掉或调整了什么。\n输出语言与原文一致。\n\n【原文】\n{{原文}}"
    },
    "en": {
      "title": "Rewrite for a different reader",
      "prompt": "Rewrite the content below for {{target_reader}}. After reading it, they should be able to {{goal}}.\n\nBefore writing, work out three things without writing them down: what this reader already knows, what they care about most, and where they would get lost.\n\nRules:\n1. Keep every fact, number and conclusion unchanged. Add nothing that is not in the original.\n2. Replace jargon the reader would not know with everyday words. If a term must stay, explain it in one sentence the first time it appears.\n3. Reorder the content around what this reader cares about most; you do not have to follow the original order.\n4. Cut details that are useless to this reader.\n5. Aim for about {{length}} the length of the original.\n\nOutput the rewritten text, then up to 3 bullet points on what you cut or moved.\nWrite in the same language as the original.\n\n[Original]\n{{original}}"
    }
  },
  {
    "id": "report-to-boss",
    "category": "office",
    "zh": {
      "title": "向上汇报：结论先行",
      "prompt": "把下面的材料整理成给{{汇报对象}}的汇报，对方大概只有 {{阅读时间}} 来看。\n\n用结论先行的结构：\n1. 结论：第一句话说清现在是什么情况，需要对方做什么（拍板、给资源，还是知悉即可）。\n2. 理由：不超过 3 条，按重要程度排列，每条一句话，有数据就带上。\n3. 方案：如果需要对方拍板，列出 2 到 3 个选项，写明各自的代价，并说明我推荐哪个。\n4. 风险和下一步：一两句话。\n\n规则：\n- 只用材料里的信息，材料没有的数据不要估算。\n- 不写过程流水账，上级想看过程会再问。\n- 用词直接，少用“基本”“大概”“正在推进”。\n\n如果从材料里看不出需要对方做什么，在开头单独问我。\n\n【材料】\n{{材料}}"
    },
    "en": {
      "title": "Bottom-line-up-front update",
      "prompt": "Turn the material below into an update for {{recipient}}, who has about {{reading_time}} to read it.\n\nLead with the bottom line:\n1. Bottom line: in the first sentence, say where things stand and what you need from them: a decision, resources, or just awareness.\n2. Why: up to 3 reasons in order of importance, one sentence each, with numbers where available.\n3. Options: if they need to decide, give 2 to 3 options with the cost of each, and say which one I recommend.\n4. Risks and next step: one or two sentences.\n\nRules:\n- Use only the material. Do not estimate numbers it does not contain.\n- No blow-by-blow history. They will ask if they want it.\n- Be direct. Avoid \"basically\", \"roughly\" and \"making progress\".\n\nIf the material does not make clear what they need to do, ask me that first, at the top.\n\n[Material]\n{{material}}"
    }
  },
  {
    "id": "proofread-typos",
    "category": "translate",
    "zh": {
      "title": "错别字和病句检查",
      "prompt": "校对下面的文字。这次只找错，不润色：只标出确定有错的地方，不调整写作风格，不改写本身成立的句子。\n\n检查范围：\n- 错别字和同音字误用，例如“在”和“再”、“的地得”\n- 病句：成分残缺、搭配不当、语序不当、重复啰嗦\n- 标点：中英文标点混用，引号或括号不配对，顿号和逗号误用\n- 前后不一致：同一个名称、数字、日期在文中写法不同\n\n输出一张表：| 序号 | 原文片段 | 问题类型 | 建议改为 | 说明 |\n原文片段只截取能定位的一小段。按在文中出现的顺序排列。\n可改可不改的地方不要列。没有发现问题就回复“未发现错误”。\n\n【待校对文字】\n{{原文}}"
    },
    "en": {
      "title": "Proofread for errors only",
      "prompt": "Proofread the text below. Find errors only; do not edit for style. Flag only things that are definitely wrong, and leave sentences that work as they are.\n\nCheck for:\n- Typos and commonly confused words, such as its/it's, affect/effect, than/then\n- Grammar: missing words, wrong word combinations, agreement errors, accidental repetition\n- Punctuation: unmatched quotes or brackets, comma splices, mixed punctuation styles\n- Inconsistencies: the same name, number or date written differently in different places\n\nOutput a table: | # | Original snippet | Problem type | Suggested fix | Note |\nQuote just enough of the original to locate each error, and list them in the order they appear.\nSkip matters of preference. If you find nothing, reply \"No errors found.\"\n\n[Text to proofread]\n{{text}}"
    }
  },
  {
    "id": "speech-draft",
    "category": "writing",
    "zh": {
      "title": "演讲发言稿",
      "prompt": "写一篇发言稿。场合是{{场合}}，时长约 {{时长}} 分钟，听众是{{听众}}。\n\n我要讲的要点：\n{{要点}}\n\n这是念出来的稿子，不是书面文章：\n1. 句子短，一句话只说一件事，避免长定语。\n2. 按每分钟约 220 字控制总长度。\n3. 称呼一句带过，接着在 30 秒内讲一个具体的小场景引出主题，不堆客套话。\n4. 要点之间用口语化的过渡句连接，让听众知道讲到了哪里。\n5. 最后用一句容易记住的话收尾，再简短致谢。\n\n只写我给出的要点，不添加我没提到的成绩、数据和人名。\n输出发言稿全文，并在段落之间用【停顿】标出适合停顿的位置。"
    },
    "en": {
      "title": "Speech draft",
      "prompt": "Write a speech for {{occasion}}. It should run about {{minutes}} minutes, and the audience is {{audience}}.\n\nPoints I want to make:\n{{points}}\n\nThis will be spoken, not read:\n1. Use short sentences, one idea each. Avoid long modifiers.\n2. Budget about 130 words per minute.\n3. Keep the greeting to one line, then open with a small concrete moment within the first 30 seconds that leads into the topic.\n4. Connect the points with spoken transitions so listeners know where they are.\n5. Close with one line people will remember, then a brief thank-you.\n\nOnly use the points I gave. Do not add achievements, numbers or names I did not mention.\nOutput the full speech, with good places to pause marked [pause]."
    }
  },
  {
    "id": "ppt-outline",
    "category": "office",
    "zh": {
      "title": "汇报 PPT 大纲",
      "prompt": "为下面的内容做一份 PPT 大纲，用于{{场合}}，约 {{页数}} 页。\n\n每页标题写成一句结论，例如“新渠道获客成本比老渠道低 30%”，而不是“渠道分析”。\n\n输出表格：| 页码 | 标题（结论句） | 页面要点（不超过 3 条） | 建议的图表或配图 |\n\n要求：\n1. 第 1 页是封面，第 2 页是全篇结论摘要，最后一页是需要听众拍板或配合的事项。\n2. 一页只讲一个结论。\n3. 数据只用材料里的。需要数据但材料里没有的页面，在要点里写【需补数据：……】。\n4. 建议图表时写明类型和理由，例如“折线图，看趋势”“柱状图，做对比”，不要只写“配图”。\n\n【汇报内容】\n{{内容}}"
    },
    "en": {
      "title": "Slide deck outline",
      "prompt": "Outline a slide deck for {{occasion}} from the content below, about {{slide_count}} slides.\n\nWrite each slide title as a conclusion, such as \"The new channel acquires customers 30% cheaper\", not \"Channel analysis\".\n\nOutput a table: | Slide | Title (a conclusion) | Key points (3 max) | Suggested chart or visual |\n\nRequirements:\n1. Slide 1 is the cover, slide 2 summarizes all conclusions, and the last slide lists what the audience needs to decide or help with.\n2. One conclusion per slide.\n3. Use only data from the content. If a slide needs data the content does not have, write [Data needed: ...] in its key points.\n4. When suggesting a chart, name the type and the reason, such as \"line chart, shows the trend\" or \"bar chart, compares options\". Never just \"add a visual\".\n\n[Content]\n{{content}}"
    }
  },
  {
    "id": "tone-adjust",
    "category": "translate",
    "zh": {
      "title": "调整说话语气",
      "prompt": "把下面这段话改成“{{目标语气}}”的语气，发给{{对象}}。\n\n要求：\n1. 要传达的信息和要求一项都不能少，也不加新的承诺。\n2. 只调整措辞、语序和句式，篇幅与原文接近。\n3. 给出 3 个版本，语气由轻到重，每个版本前用一句话说明区别。\n4. 不用网络流行语和表情符号，除非原文本来就有。\n\n最后指出原文里最容易让对方不舒服的一个说法，并说明原因。\n\n【原文】\n{{原文}}"
    },
    "en": {
      "title": "Adjust the tone of a message",
      "prompt": "Rewrite the message below in a \"{{target_tone}}\" tone. It is going to {{recipient}}.\n\nRequirements:\n1. Keep every piece of information and every request. Add no new commitments.\n2. Change only wording, order and sentence structure; keep the length close to the original.\n3. Give 3 versions, from softest to firmest, each introduced by one sentence on how it differs.\n4. No slang or emoji unless the original already uses them.\n\nFinally, point out the one phrase in the original most likely to rub the recipient the wrong way, and why.\n\n[Original]\n{{original}}"
    }
  },
  {
    "id": "novel-outline",
    "category": "writing",
    "zh": {
      "title": "长篇小说大纲",
      "prompt": "为一部{{题材}}小说做大纲，共 {{章节数}} 章。\n\n【已有设定】\n主角：{{主角}}\n核心冲突：{{核心冲突}}\n\n输出四部分：\n1. 一句话故事：主角是谁，想要什么，最大的阻碍是什么。\n2. 主要人物：3 到 5 个，每人写清目标、和主角的关系、在哪一章发生转变。\n3. 分章大纲：表格，列为“章节｜本章事件｜主角处境的变化｜埋下或回收的伏笔”。每章事件不超过 60 字。\n4. 三处关键转折：分别在全书约 1/4、1/2、3/4 处，说明它们为什么是故事必然走到的一步。\n\n要求：\n- 每一章都要让局面发生变化，不写只有日常过渡的章节。\n- 埋下的伏笔必须在后面某章回收，回收章节在表格里写明。\n- 设定里没给的世界观细节可以补充，但补充内容单独列在最后，标注“新增设定”。"
    },
    "en": {
      "title": "Novel outline",
      "prompt": "Outline a {{genre}} novel in {{chapters}} chapters.\n\n[What I have]\nProtagonist: {{protagonist}}\nCentral conflict: {{central_conflict}}\n\nOutput four parts:\n1. Logline: who the protagonist is, what they want, and the biggest obstacle.\n2. Main characters: 3 to 5, each with their goal, their relationship to the protagonist, and the chapter where they change.\n3. Chapter outline: a table with columns \"Chapter | What happens | How the protagonist's situation changes | Clue planted or paid off\". Keep each \"what happens\" under 40 words.\n4. Three key turns at roughly the 1/4, 1/2 and 3/4 marks, and why the story has to go there.\n\nRequirements:\n- Every chapter must change the situation. No filler chapters.\n- Every planted clue pays off in a later chapter; note which one in the table.\n- You may add world-building details I did not give, but list them separately at the end under \"New details\"."
    }
  },
  {
    "id": "resume-bullets",
    "category": "office",
    "zh": {
      "title": "简历经历改写",
      "prompt": "把我的工作经历改写成简历条目，目标岗位是{{目标岗位}}。\n\n每条用“动作 + 对象 + 结果”的结构，以动词开头。\n\n规则：\n1. 只用我提供的事实。结果里的数字只能来自原文；原文没有数字但适合量化的地方，写成【补充数据：例如……】提醒我。\n2. 优先保留和目标岗位相关的经历，无关的压缩成一句或删掉。\n3. 每条不超过 40 个字，每段经历 3 到 5 条。\n4. 不用“负责”“参与”这类看不出贡献的词开头，不写“抗压能力强”这类自我评价。\n\n输出：\n1. 改写后的条目，按经历分组。\n2. 对照目标岗位的常见要求，我的经历里还缺什么，列 2 到 3 条。\n\n【原始经历】\n{{经历}}"
    },
    "en": {
      "title": "Resume bullet rewrite",
      "prompt": "Rewrite my work experience as resume bullets for a {{target_role}} role.\n\nEach bullet follows \"action + what + result\" and starts with a verb.\n\nRules:\n1. Use only the facts I give. Numbers in results must come from my text. Where a number would help but I gave none, write [Add data: for example ...] as a reminder.\n2. Put experience relevant to the target role first; compress or drop the rest.\n3. Keep each bullet under 25 words, with 3 to 5 bullets per job.\n4. Do not start with \"Responsible for\" or \"Participated in\", and leave out self-praise like \"strong work ethic\".\n\nOutput:\n1. The rewritten bullets, grouped by job.\n2. 2 to 3 common requirements for this role that my experience does not yet show.\n\n[My experience]\n{{experience}}"
    }
  }
]
