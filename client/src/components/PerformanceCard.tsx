import type { XirrResult } from "../finance";

const percent = new Intl.NumberFormat("th-TH", { style: "percent", maximumFractionDigits: 1 });
const percentPoint = new Intl.NumberFormat("th-TH", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" });
const baht = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });

/**
 * Realised performance against the plan.
 *
 * XIRR is money-weighted: it answers "what did the money I actually put in
 * earn", so a large early purchase counts for more than a small late one.
 * That is the honest comparison against the user's own target — the forward
 * projection in the app is time-weighted and ignores timing entirely, so the
 * two are shown side by side rather than one replacing the other.
 *
 * Every "no number" case is spelled out. A silent dash reads as zero.
 */
export function PerformanceCard({
  result,
  expectedAnnualReturn,
  currentValueThb,
}: {
  result: XirrResult;
  expectedAnnualReturn: number;
  currentValueThb: number;
}) {
  const gap = result.rate == null ? null : result.rate - expectedAnnualReturn;
  const beats = gap != null && gap > 0;

  let reason: string | null = null;
  if (result.days === 0) reason = "ยังไม่มีรายการซื้อ — บันทึกรายการแรกเพื่อวัดผลตอบแทนจริง";
  else if (result.rate == null && result.days < 30) reason = "ผ่านมาไม่ถึง 30 วัน การคำนวณผลตอบแทนต่อปียังไม่มีความหมาย";
  else if (result.rate == null) reason = "ยังคำนวณผลตอบแทนต่อปีไม่ได้ ลองตรวจสอบรายการซื้ออีกครั้ง";

  return (
    <section className="section-block projection-block" aria-label="ผลตอบแทนจริงเทียบกับแผน">
      <div className="section-heading">
        <div><p className="section-kicker">ผลงานจริง</p><h2>ผลตอบแทนเทียบแผน</h2></div>
        {result.days > 0 && <span className="muted">{result.days} วัน</span>}
      </div>
      <div className="performance-grid">
        <div><span>ผลตอบแทนจริง (XIRR)</span><strong className={result.rate == null ? "muted" : result.rate >= 0 ? "positive" : "negative"}>{result.rate == null ? "—" : percent.format(result.rate)}</strong></div>
        <div><span>ที่ตั้งไว้ในแผน</span><strong className="muted">{percent.format(expectedAnnualReturn)}</strong></div>
        <div><span>ผลต่าง</span><strong className={gap == null ? "muted" : beats ? "positive" : "negative"}>{gap == null ? "—" : `${percentPoint.format(gap)} จุด`}</strong></div>
      </div>
      {result.total != null && (
        <p className="fineprint">
          ผลตอบแทนสะสมทั้งช่วง {percent.format(result.total)} · พอร์ตมูลค่า {baht.format(currentValueThb)}
          {result.isPartialYear && " · ยังไม่ครบปี ค่าต่อปีถูกประมาณจากช่วงเวลาที่สั้นกว่านั้น"}
        </p>
      )}
      {reason && <p className="fineprint">{reason}</p>}
      <p className="fineprint">
        XIRR ถ่วงด้วยจังหวะและขนาดเงินที่ลงทุนจริง ไม่ใช่คำแนะนำลงทุน และถือว่าขายก่อนวันนี้ไม่มีอยู่ในระบบ
      </p>
    </section>
  );
}
