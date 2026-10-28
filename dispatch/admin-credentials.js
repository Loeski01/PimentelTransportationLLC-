"use strict";
function createAdminCredentialStore(pool,email){
 const normalized=email.trim().toLowerCase();
 return {
  async initialize(bootstrapHash){
   const database=await pool.query("SELECT current_database() AS name");
   if(database.rows[0]?.name!=="pimentel_dispatch_dev")throw Error("Unexpected administrator database");
   const client=await pool.connect();
   try{
    await client.query("BEGIN");
    await client.query("CREATE TABLE IF NOT EXISTS admin_credentials (id SMALLINT PRIMARY KEY CHECK(id=1),email VARCHAR(254) NOT NULL,password_hash TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    await client.query("INSERT INTO admin_credentials(id,email,password_hash) VALUES(1,$1,$2) ON CONFLICT(id) DO NOTHING",[normalized,bootstrapHash]);
    const owner=await client.query("SELECT email FROM admin_credentials WHERE id=1");
    if(owner.rows[0]?.email!==normalized)throw Error("Administrator identity differs from configured owner");
    await client.query("COMMIT");
   }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  },
  async getHash(){
   const result=await pool.query("SELECT password_hash FROM admin_credentials WHERE id=1 AND email=$1",[normalized]);
   if(!result.rows[0])throw Error("Administrator credentials unavailable");
   return result.rows[0].password_hash;
  },
  async replaceHash(previous,replacement){
   const client=await pool.connect();
   try{
    await client.query("BEGIN");
    const result=await client.query("UPDATE admin_credentials SET password_hash=$1,updated_at=now() WHERE id=1 AND email=$2 AND password_hash=$3 RETURNING id",[replacement,normalized,previous]);
    if(!result.rowCount){await client.query("ROLLBACK");return false;}
    await client.query("INSERT INTO dispatch_audit(actor_role,actor_id,action) VALUES('admin','admin','admin_password_changed')");
    await client.query("COMMIT");return true;
   }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }
 };
}
module.exports={createAdminCredentialStore};
