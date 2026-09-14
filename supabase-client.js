// supabase-client.js
// SUPABASE CONNECTION CONFIGURATION

const SUPABASE_URL = "https://ohsrxqeidiujkljpsycb.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oc3J4cWVpZGl1amtsanBzeWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzODE5NzAsImV4cCI6MjEwNDk1Nzk3MH0.R-acgygzIKeo7Gci5gs_s_t5aMr8_0sOXB_MvGRN-lk"; 

// Initialize the Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);