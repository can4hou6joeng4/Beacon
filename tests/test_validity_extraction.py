import unittest

from pdf_expiry_checker.extractor import analyze_ocr_pages, extract_expiry_from_context, parse_ocr_text


class ValidityExtractionTests(unittest.TestCase):
    def test_tracks_ocr_error_pages_separately_from_successful_pages(self):
        parsed = parse_ocr_text(
            "\n".join(
                [
                    "PAGE\t1\tERROR\tdomain=Vision code=1",
                    "PAGE\t2\tLINES\t2",
                    "一级注册造价师证",
                    "有效期：2025年01月01日-2026年01月01日",
                    "PAGE_END\t2",
                ]
            )
        )

        self.assertEqual(parsed.pages, {2: ["一级注册造价师证", "有效期：2025年01月01日-2026年01月01日"]})
        self.assertEqual(parsed.error_pages, {1: "domain=Vision code=1"})

    def test_uses_last_date_in_validity_range_as_expiry(self):
        expiry = extract_expiry_from_context("有效期：2026年02月27日 2026年05月28日")
        self.assertEqual(expiry, "2026-05-28")

    def test_extracts_validity_when_ocr_inserts_spaces_between_chinese_characters(self):
        pages = {
            1: [
                "一级造价工程师注册证书",
                "有 效 期 : 2025年07月21日-2029年07月20日",
            ],
        }

        result = analyze_ocr_pages(pages, cutoff="2026-06-03")

        self.assertEqual(result["candidates"][0]["expiry_date"], "2029-07-20")

    def test_extracts_validity_when_ocr_misreads_middle_characters(self):
        pages = {
            1: [
                "一级造价工程师注册证书",
                "有 RM 期 : 2025年12月03日-2029年12月02日",
            ],
            2: [
                "二级造价工程师注册证书",
                "有 B 期: 2025年12月05日-2029年12月04昌",
            ],
            3: [
                "二级造价工程师注册证书",
                "有 效 FA: 2025年08月03日-2029年08月03日",
            ],
        }

        result = analyze_ocr_pages(pages, cutoff="2026-06-03")

        self.assertEqual([row["expiry_date"] for row in result["candidates"]], ["2029-12-02", "2029-12-04", "2029-08-03"])

    def test_extracts_id_card_validity_when_ocr_misreads_limit_character(self):
        pages = {
            1: [
                "身份证",
                "有效贿限 —2018.10.29-2038.10.29",
            ],
        }

        result = analyze_ocr_pages(pages, cutoff="2026-06-03")

        self.assertEqual(result["candidates"][0]["expiry_date"], "2038-10-29")

    def test_long_term_id_card_is_not_before_cutoff(self):
        expiry = extract_expiry_from_context("有效期限 2026.03.11-长期")
        self.assertEqual(expiry, "长期")

    def test_compact_id_card_tail_date_is_normalized(self):
        expiry = extract_expiry_from_context("有效期限 2021.01.29-2041.0129")
        self.assertEqual(expiry, "2041-01-29")

    def test_compact_eight_digit_tail_date_is_normalized(self):
        expiry = extract_expiry_from_context("有效期限 2021.01.29-20410129")
        self.assertEqual(expiry, "2041-01-29")

    def test_ignores_registration_change_record_date_after_expiry(self):
        expiry = extract_expiry_from_context("有效期：2028年07月02日 2026-01-07- 机构内变更-安装")
        self.assertEqual(expiry, "2028-07-02")

    def test_uses_document_use_validity_as_primary_certificate_expiry(self):
        pages = {
            101: [
                "一级注册造价师证（安装）",
                "使用有效期：2026年02月27日",
                "- 2026年05月28日",
                "中华人民共和国",
                "一级造价工程师注册证书",
                "证书编号：建［造］14254400038715",
                "有效期：",
                "2025年07月07日-2029年07月06日",
            ],
        }
        result = analyze_ocr_pages(pages, cutoff="2026-06-03")
        self.assertEqual([row["expiry_date"] for row in result["matches"]], ["2026-05-28"])
        self.assertEqual([row["expiry_date"] for row in result["candidates"]], ["2026-05-28", "2029-07-06"])

    def test_marks_primary_cost_certificate_for_review_when_use_validity_is_missing(self):
        pages = {
            15: [
                "一级注册造价师证〈安装)",
                "一级造价工程师注册证书",
                "有 效 期: 2025年12月03日-2029年12月02日",
            ],
        }

        result = analyze_ocr_pages(pages, cutoff="2026-06-03")

        self.assertEqual(result["candidates"][0]["expiry_date"], "2029-12-02")
        self.assertEqual(result["needs_review"][0]["reason"], "一级注册造价师证应以使用有效期为准，但 OCR 未识别到该字段")

    def test_filters_before_cutoff_and_keeps_near_expiry(self):
        pages = {
            1: [
                "一级注册造价师证（安装）",
                "有效期：2026年02月27日 2026年05月20日",
            ],
            2: [
                "一级注册造价师证（安装）",
                "有效期：2026年02月27日 2026年05月28日",
            ],
            3: [
                "身份证",
                "有效期限",
                "2026.03.11-长期",
            ],
        }
        result = analyze_ocr_pages(pages, cutoff="2026-05-22")
        self.assertEqual([row["page"] for row in result["matches"]], [1])
        self.assertEqual(result["matches"][0]["expiry_date"], "2026-05-20")
        self.assertEqual([row["page"] for row in result["near_expiry"]], [2])
        self.assertEqual(result["summary"]["validity_candidates"], 3)


if __name__ == "__main__":
    unittest.main()
