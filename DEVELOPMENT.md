# Development Workflow

## Branches & Environments

- **`main`** → Production (Supabase prod: `ajbpzueanpeukozjhkiv`)
- **`dev`** → Development (Supabase dev: `nkzsjyzhpvivfgslzltn`)

## URLs

- **Production**: https://jccattenom.cantarero.fr/
- **Development**: https://jccattenom.cantarero.fr/?env=dev

## Workflow

### 1. Feature Development

```bash
# Create feature branch from dev
git checkout dev
git pull origin dev
git checkout -b feature/my-feature

# Make changes, commit, push
git push origin feature/my-feature

# Create PR to dev
# → Test on dev environment
```

### 2. Testing on Dev

- Push to `dev` branch → deploys to dev Supabase project
- Test at: https://jccattenom.cantarero.fr/?env=dev
- Database changes are isolated to dev project

### 3. Merge to Production

```bash
# After testing on dev, merge to main
git checkout main
git pull origin main
git merge dev
git push origin main

# → Deploys to prod Supabase
# → Migrations run on prod project
```

## Database Migrations

### Creating a Migration

```bash
# Create new migration file
supabase migration new my_migration_name

# Edit the SQL file in supabase/migrations/
# Push to dev first to test
git checkout dev
git add supabase/migrations/
git commit -m "feat: add my_migration_name"
git push origin dev

# Test on dev environment
# Once verified, merge to main
```

## Best Practices

✅ **DO:**
- Test migrations on dev first
- Use descriptive commit messages
- Keep dev and main in sync
- Review changes before merging to main

❌ **DON'T:**
- Push directly to main (use PR)
- Modify prod data without backup
- Skip testing on dev
- Commit secrets or credentials
