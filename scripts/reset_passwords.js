const path = require('path');
const bcrypt = require(path.join(__dirname, '../node_modules/bcrypt'));
const prisma = require('../src/config/coSoDuLieu');

async function main() {
  const hash = await bcrypt.hash('tvu123', 10);
  console.log('Generated hash for tvu123:', hash);

  // Update all users' password to tvu123 and set doi_mat_khau_lan_dau = true
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "public"."nguoi_dung"
    SET "mat_khau_hash" = $1,
        "doi_mat_khau_lan_dau" = true
  `, hash);
  console.log(`Updated ${updated} users to password 'tvu123' and doi_mat_khau_lan_dau = true.`);

  // Update ktvkhoi phone number to 10 digits
  await prisma.$executeRawUnsafe(`
    UPDATE "public"."nguoi_dung"
    SET "so_dien_thoai" = '0919623600'
    WHERE "tai_khoan" = 'ktvkhoi' AND LENGTH("so_dien_thoai") < 10
  `);

  // Verify
  const rows = await prisma.$queryRawUnsafe(`
    SELECT ma_nguoi_dung, tai_khoan, ho_ten, so_dien_thoai, doi_mat_khau_lan_dau
    FROM "public"."nguoi_dung"
    ORDER BY ma_nguoi_dung ASC
  `);
  console.log('Users after update:', rows);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
