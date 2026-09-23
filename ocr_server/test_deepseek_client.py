import unittest

from ocr_server.deepseek_client import extract_labeled_fields


class LabeledFieldFallbackTest(unittest.TestCase):
    def test_extracts_case_two_fields(self):
        text = """会议负责人：李涛
会议开始时间：2026-08-29
会议召开省-市：广东省惠州市
会议召开科室：100115100000000136L8
本次会议为惠州市医学会精准医学分会成立大会暨首届精准医学学术论坛，该会议将邀请专家
权益明细，详细说明：1、标准展台；2、专家专题介绍大panel临床应用意义；
本会议目标客户信息：惠州市第一人民医院
既往合作：2026年3月开始落地检测TMB，NTRK试剂盒已进院（合同签署中）
院内送检占比：80%
当前销量（万元/
月），近半年月均销
月均1.6w
会议目标（万元/
月均10w目标
增长点，详细说明
（重要！）：
NTRK进院后，落地开展中panel，有利于临床推动上量：
其他所需支持：
参会部门：南区KA
费用明细
共3条，合计28,800"""

        fields = extract_labeled_fields(text)

        expected = {
            "applicant": "李涛",
            "district": "广东省惠州市",
            "region": "南区",
            "hospital": "惠州市第一人民医院",
            "meetingDate": "2026-08-29",
            "requestedAmount": "2.88",
            "inHospitalSubmissionRatio": "80%",
            "currentSales": "月均1.6万",
            "targetSales": "月均10万",
        }
        for key, value in expected.items():
            self.assertEqual(fields[key].value, value)
        self.assertIn("标准展台", fields["benefits"].value)
        self.assertIn("NTRK进院后", fields["growthPoints"].value)
        self.assertNotIn("department", fields)


if __name__ == "__main__":
    unittest.main()
