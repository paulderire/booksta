const { execSync } = require('child_process');

try {
  console.log('Adding changes...');
  execSync('git add -A', {stdio: 'inherit'});
  
  console.log('Committing changes...');
  execSync('git commit -m "Update footer branding and add modern social media icons with line breaks"', {stdio: 'inherit'});
  
  console.log('Pushing to remote...');
  execSync('git push', {stdio: 'inherit'});
  
  console.log('✅ Successfully deployed!');
} catch (error) {
  console.error('Deploy error:', error.message);
  process.exit(1);
}
