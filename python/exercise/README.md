# Module 03 Python 练习：写一个布局合法性检查器

只需要 Python 3.8 及以上，不需要安装任何包。

## 文件

| 文件 | 用途 |
| --- | --- |
| `starter.py` | 你要完成的文件。标了 `TODO` 的 7 个函数需要你来写。 |
| `check.py` | 自测脚本：用 `fixtures/cases.json` 里的 24 个用例检查你的实现。 |
| `reference.py` | 参考答案。建议先自己写完再看。 |
| `fixtures/cases.json` | 用例和期望结果（由主检查器生成，它和网页版、OpenROAD、CP-SAT 都做过交叉验证）。 |

## 步骤

```bash
python check.py                    # 检查 starter.py
python check.py --impl reference   # 看参考答案跑一遍
```

最后一行会是三种状态之一：

- `PASS`：全部用例都对。
- `INCOMPLETE`：目前没有算错的，但还有函数没写（会列出名字）。
- `FAIL`：至少有一个用例算错了，上面会列出期望值和你的结果。

## 要实现的规则

1. `validate`：先查输入。空布局 `V_EMPTY`，缺单元 `V_MISSING`，多了没声明的单元 `V_UNKNOWN`，坐标不是有限的数 `V_NONFINITE`。有任何一条，结论就是 `invalid`，不再做几何检查。
2. `on_row`：底边 y 必须正好是某一行的底边。
3. `on_site`：`x − siteX0` 必须是站点宽的整数倍。差半格也不行。
4. `inside`：整个矩形都在芯片里，不只是左下角。
5. `intervals_overlap`：区间 `[x, x+w)` 左闭右开，**相接不算重叠**。只比较同一行（而且确实在行上）的单元。
6. `displacement`：相对一张不变的参考布局，每个单元 |Δx| + |Δy|，给出总和、平均值、最大值。
7. `hpwl`：每个线网取单元**中心**的包围盒，宽 + 高，再求和。

坐标要换成整数数据库单位（DBU，每单位 1000）再比较。有三个用例的站点宽是 0.19，直接用浮点数比较会出错。

## 许可

代码 MIT；说明文字 CC BY 4.0。改编自 Yongfu Li 的 eda-learning 课程材料（CC BY 4.0）。

---

*English:* implement the seven `TODO` functions in `starter.py`, then run `python check.py`. The
script prints `PASS`, `INCOMPLETE` (some functions still raise `NotImplementedError`) or `FAIL`
(with expected vs. actual values). Coordinates must be compared as integer DBU (1000 per unit);
intervals are half-open, so touching cells do not overlap.
